#!/usr/bin/env python3
"""
RevForgeHQ — Seed Neon Postgres with leads from CSV/XLSX sources.

Usage:
    psql "$DATABASE_URL" -f scripts/sql/leads_schema.sql

    python scripts/seed_leads.py --dry-run
    python scripts/seed_leads.py

    python scripts/seed_leads.py --source adobe_summit \
      --input ~/Downloads/adobe_summit_tiered.xlsx

    python scripts/seed_leads.py --source linkedin_varun \
      --input ~/Downloads/Connections.xlsx
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from lib.leads_io import (  # noqa: E402
    LEADS_CSV,
    SOURCE_ADOBE_SUMMIT,
    SOURCE_LINKEDIN_VARUN,
    load_leads,
)

OUTPUT_DIR = ROOT / "scripts" / "output"

load_dotenv(ROOT / ".env", override=False)
load_dotenv(ROOT / ".dev.vars", override=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

UPSERT_SQL = """
INSERT INTO leads (
    id, full_name, first_name, last_name, company, company_key, title,
    tier, tier_reason, score, is_decision_maker, dm_reason,
    email, email_status, email_verified_at,
    lead_source, linkedin_url, updated_at
) VALUES (
    %(id)s, %(full_name)s, %(first_name)s, %(last_name)s, %(company)s, %(company_key)s, %(title)s,
    %(tier)s, %(tier_reason)s, %(score)s, %(is_decision_maker)s, %(dm_reason)s,
    %(email)s, %(email_status)s,
    CASE WHEN %(email)s IS NOT NULL THEN NOW() ELSE NULL END,
    %(lead_source)s, %(linkedin_url)s, NOW()
)
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    company = EXCLUDED.company,
    company_key = EXCLUDED.company_key,
    title = EXCLUDED.title,
    tier = EXCLUDED.tier,
    tier_reason = EXCLUDED.tier_reason,
    score = EXCLUDED.score,
    is_decision_maker = EXCLUDED.is_decision_maker,
    dm_reason = EXCLUDED.dm_reason,
    email = COALESCE(EXCLUDED.email, leads.email),
    email_status = COALESCE(EXCLUDED.email_status, leads.email_status),
    email_verified_at = CASE
        WHEN EXCLUDED.email IS NOT NULL AND leads.email IS DISTINCT FROM EXCLUDED.email THEN NOW()
        ELSE leads.email_verified_at
    END,
    lead_source = EXCLUDED.lead_source,
    linkedin_url = COALESCE(EXCLUDED.linkedin_url, leads.linkedin_url),
    updated_at = NOW()
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Neon Postgres with RevForge leads")
    parser.add_argument("--input", type=Path, help="Path to leads CSV or XLSX")
    parser.add_argument(
        "--source",
        choices=[SOURCE_ADOBE_SUMMIT, SOURCE_LINKEDIN_VARUN],
        default=SOURCE_ADOBE_SUMMIT,
        help="Lead source tag (default: adobe_summit)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate data; no DB writes")
    parser.add_argument("--truncate", action="store_true", help="Clear leads and send log before seed")
    parser.add_argument("--tier", type=int, choices=[1, 2, 3], help="Seed only this tier (adobe_summit)")
    parser.add_argument("--limit", type=int, help="Max leads to seed")
    return parser.parse_args()


def require_database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        log.error("DATABASE_URL is not set. Add it to .dev.vars (see docs/GTM.md).")
        sys.exit(1)
    return url


def write_summary(payload: dict) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = OUTPUT_DIR / f"leads_seed_{timestamp}_summary.json"
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    return path


def main() -> int:
    args = parse_args()
    input_path = (args.input or LEADS_CSV).expanduser().resolve()
    if not input_path.exists():
        log.error("Input file not found: %s", input_path)
        return 1

    leads = load_leads(input_path, limit=args.limit, tier=args.tier, source=args.source)
    tier_counts = Counter(lead["tier"] for lead in leads if lead.get("tier") is not None)
    with_email = sum(1 for lead in leads if lead.get("email"))
    source_counts = Counter(lead["lead_source"] for lead in leads)

    log.info("Loaded %s leads from %s", len(leads), input_path)
    log.info("  Source: %s", dict(source_counts))
    if tier_counts:
        log.info("  Tier breakdown: %s", dict(tier_counts))
    log.info("  With email: %s", with_email)

    if args.dry_run:
        return 0

    database_url = require_database_url()
    conn = psycopg2.connect(database_url)
    try:
        with conn:
            with conn.cursor() as cur:
                if args.truncate:
                    log.info("Truncating lead_email_sends and leads ...")
                    cur.execute("TRUNCATE lead_email_sends, leads RESTART IDENTITY CASCADE")

                psycopg2.extras.execute_batch(cur, UPSERT_SQL, leads, page_size=200)
                log.info("Upserted %s leads", len(leads))

                cur.execute("SELECT COUNT(*)::int FROM leads")
                total = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*)::int FROM leads WHERE email IS NOT NULL")
                email_count = cur.fetchone()[0]
                cur.execute(
                    "SELECT lead_source, COUNT(*)::int FROM leads GROUP BY lead_source ORDER BY lead_source"
                )
                by_source = dict(cur.fetchall())
    finally:
        conn.close()

    summary_path = write_summary(
        {
            "input_file": str(input_path),
            "source": args.source,
            "tier_filter": args.tier,
            "leads_submitted": len(leads),
            "with_email": with_email,
            "tier_breakdown": dict(tier_counts),
            "total_in_db": total,
            "with_email_in_db": email_count,
            "by_source_in_db": by_source,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    log.info("Wrote summary: %s", summary_path)
    log.info("Done. %s leads in Neon (%s with email)", total, email_count)
    log.info("  By source: %s", by_source)
    return 0


if __name__ == "__main__":
    sys.exit(main())
