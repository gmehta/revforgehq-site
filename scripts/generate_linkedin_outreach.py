#!/usr/bin/env python3
"""
Generate LinkedIn outreach drafts for Varun tier 1-3 cohort via Cloudflare API.

Usage:
    python scripts/generate_linkedin_outreach.py --dry-run
    python scripts/generate_linkedin_outreach.py --base-url https://www.revforgehq.com
    python scripts/generate_linkedin_outreach.py --batch-size 5 --sleep 1.5
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "scripts" / "output"
CHECKPOINT_PATH = OUTPUT_DIR / "outreach_checkpoint.json"

load_dotenv(ROOT / ".env", override=False)
load_dotenv(ROOT / ".dev.vars", override=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Batch-generate LinkedIn outreach via Cloudflare API")
    parser.add_argument("--base-url", default=os.getenv("OUTREACH_API_BASE", "https://www.revforgehq.com"))
    parser.add_argument("--batch-size", type=int, default=5, help="Leads per API call (?batch=N)")
    parser.add_argument("--sleep", type=float, default=1.0, help="Seconds between batch calls")
    parser.add_argument("--max-batches", type=int, default=0, help="Stop after N batches (0 = unlimited)")
    parser.add_argument("--force", action="store_true", help="Regenerate even if message exists")
    parser.add_argument("--dry-run", action="store_true", help="Show cohort stats only")
    return parser.parse_args()


def load_checkpoint() -> dict:
    if CHECKPOINT_PATH.exists():
        return json.loads(CHECKPOINT_PATH.read_text())
    return {"generated": 0, "errors": [], "last_batch": None}


def save_checkpoint(data: dict) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CHECKPOINT_PATH.write_text(json.dumps(data, indent=2))


def cohort_stats(conn) -> tuple[int, int]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) FROM leads
            WHERE lead_source = 'linkedin_varun' AND gtm_tier IN (1, 2, 3)
            """
        )
        cohort = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM lead_outreach_messages")
        generated = cur.fetchone()[0]
    return cohort, generated


def main() -> int:
    args = parse_args()
    api_key = os.getenv("LEADS_API_KEY", "").strip()
    database_url = os.getenv("DATABASE_URL", "").strip()

    if not args.dry_run and not api_key:
        log.error("LEADS_API_KEY not set")
        return 1

    if database_url:
        conn = psycopg2.connect(database_url)
        try:
            cohort, generated = cohort_stats(conn)
            pending = cohort - generated
            log.info("Cohort: %d | Generated: %d | Pending: %d", cohort, generated, pending)
        finally:
            conn.close()
    else:
        cohort = generated = pending = 0
        log.warning("DATABASE_URL not set — skipping local stats")

    if args.dry_run:
        return 0

    checkpoint = load_checkpoint()
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    base = args.base_url.rstrip("/")
    url = f"{base}/api/outreach/generate"

    batch_num = 0
    total_generated = 0

    while True:
        if args.max_batches and batch_num >= args.max_batches:
            break

        params = {"batch": str(args.batch_size)}
        body = {"force": args.force} if args.force else {}
        try:
            resp = requests.post(url, headers=headers, params=params, json=body, timeout=120)
            resp.raise_for_status()
            payload = resp.json()
        except Exception as exc:
            log.error("Batch request failed: %s", exc)
            checkpoint["errors"].append(str(exc))
            save_checkpoint(checkpoint)
            return 1

        processed = payload.get("processed", 0)
        generated = payload.get("generated", 0)
        total_generated += generated
        batch_num += 1
        checkpoint["generated"] = checkpoint.get("generated", 0) + generated
        checkpoint["last_batch"] = payload
        save_checkpoint(checkpoint)

        log.info(
            "Batch %d: processed=%d generated=%d ok=%s",
            batch_num,
            processed,
            generated,
            payload.get("ok"),
        )

        if processed == 0:
            log.info("No pending leads — done.")
            break

        if args.sleep > 0:
            time.sleep(args.sleep)

    log.info("Finished — %d messages generated this run", total_generated)
    return 0


if __name__ == "__main__":
    sys.exit(main())
