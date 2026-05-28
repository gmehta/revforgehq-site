#!/usr/bin/env python3
"""
One-time account tech stack enrichment via Cloudflare API.

Usage:
    python scripts/enrich_account_stacks.py --dry-run
    python scripts/enrich_account_stacks.py --base-url https://www.revforgehq.com
    python scripts/enrich_account_stacks.py --batch-size 3 --sleep 2
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
CHECKPOINT_PATH = OUTPUT_DIR / "stack_enrichment_checkpoint.json"

load_dotenv(ROOT / ".env", override=False)
load_dotenv(ROOT / ".dev.vars", override=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Batch-enrich account tech stacks via Cloudflare API")
    parser.add_argument("--base-url", default=os.getenv("STACK_API_BASE", "https://www.revforgehq.com"))
    parser.add_argument("--batch-size", type=int, default=3, help="Accounts per API call (?batch=N, max 10)")
    parser.add_argument("--sleep", type=float, default=2.0, help="Seconds between batch calls")
    parser.add_argument("--max-batches", type=int, default=0, help="Stop after N batches (0 = unlimited)")
    parser.add_argument("--force", action="store_true", help="Re-enrich even if stack exists")
    parser.add_argument("--dry-run", action="store_true", help="Show stats only")
    return parser.parse_args()


def load_checkpoint() -> dict:
    if CHECKPOINT_PATH.exists():
        return json.loads(CHECKPOINT_PATH.read_text())
    return {"enriched": 0, "errors": [], "last_batch": None}


def save_checkpoint(data: dict) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CHECKPOINT_PATH.write_text(json.dumps(data, indent=2))


def stack_stats(conn) -> tuple[int, int]:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM accounts")
        total = cur.fetchone()[0]
        cur.execute(
            """
            SELECT COUNT(*) FROM accounts
            WHERE (tech_stack->>'enriched_at') IS NOT NULL
            """
        )
        enriched = cur.fetchone()[0]
    return total, enriched


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
            total, enriched = stack_stats(conn)
            pending = total - enriched
            log.info("Accounts: %d | Enriched: %d | Pending: %d", total, enriched, pending)
        finally:
            conn.close()
    else:
        total = enriched = pending = 0
        log.warning("DATABASE_URL not set — skipping local stats")

    if args.dry_run:
        return 0

    checkpoint = load_checkpoint()
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    base = args.base_url.rstrip("/")
    url = f"{base}/api/accounts/stack-enrich"

    batch_num = 0
    total_enriched = checkpoint.get("enriched", 0)

    while True:
        if args.max_batches and batch_num >= args.max_batches:
            break

        batch_size = min(max(args.batch_size, 1), 10)
        params = {"batch": str(batch_size)}
        body = {"force": args.force} if args.force else {}
        try:
            resp = requests.post(url, headers=headers, params=params, json=body, timeout=180)
            resp.raise_for_status()
            payload = resp.json()
        except Exception as exc:
            log.error("Batch request failed: %s", exc)
            checkpoint["errors"].append(str(exc))
            save_checkpoint(checkpoint)
            return 1

        processed = payload.get("processed", 0)
        enriched = payload.get("enriched", 0)
        errors = payload.get("errors", [])

        if processed == 0:
            log.info("No pending accounts — done")
            break

        total_enriched += enriched
        batch_num += 1
        checkpoint.update(
            {
                "enriched": total_enriched,
                "last_batch": {
                    "num": batch_num,
                    "processed": processed,
                    "enriched": enriched,
                    "errors": errors,
                },
            }
        )
        if errors:
            checkpoint["errors"].extend(errors)
        save_checkpoint(checkpoint)

        log.info(
            "Batch %d: processed=%d enriched=%d errors=%d (session total=%d)",
            batch_num,
            processed,
            enriched,
            len(errors),
            total_enriched,
        )

        if args.sleep > 0:
            time.sleep(args.sleep)

    log.info("Finished. Session enriched=%d checkpoint=%s", total_enriched, CHECKPOINT_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
