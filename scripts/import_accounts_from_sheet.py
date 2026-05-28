#!/usr/bin/env python3
"""
One-time bootstrap: import Accounts tab from GTM Google Sheet into Neon.

Requires GOOGLE_SERVICE_ACCOUNT_JSON and DATABASE_URL.
Share the spreadsheet with the service account email as Editor.

Usage:
    psql "$DATABASE_URL" -f scripts/sql/crm_schema.sql
    python scripts/import_accounts_from_sheet.py --dry-run
    python scripts/import_accounts_from_sheet.py
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from lib.crm_sheet_mapping import (  # noqa: E402
    DEFAULT_ACCOUNTS_SHEET,
    DEFAULT_SPREADSHEET_ID,
    map_account_row,
)
from lib.google_sheets import read_all_rows, resolve_sheet_title  # noqa: E402

load_dotenv(ROOT / ".env", override=False)
load_dotenv(ROOT / ".dev.vars", override=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

ACCOUNTS_GID = 466934255

UPSERT_SQL = """
INSERT INTO accounts (
    id, company_name, company_key, domain, segment, tier, status, notes, extra, updated_at
) VALUES (
    %(id)s, %(company_name)s, %(company_key)s, %(domain)s, %(segment)s, %(tier)s,
    %(status)s, %(notes)s, %(extra)s::jsonb, NOW()
)
ON CONFLICT (id) DO UPDATE SET
    company_name = EXCLUDED.company_name,
    company_key = EXCLUDED.company_key,
    domain = COALESCE(EXCLUDED.domain, accounts.domain),
    segment = COALESCE(EXCLUDED.segment, accounts.segment),
    tier = COALESCE(EXCLUDED.tier, accounts.tier),
    status = COALESCE(EXCLUDED.status, accounts.status),
    notes = COALESCE(EXCLUDED.notes, accounts.notes),
    extra = accounts.extra || EXCLUDED.extra,
    updated_at = NOW()
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import Accounts from Google Sheet into Neon")
    parser.add_argument("--spreadsheet-id", default=os.getenv("CRM_SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID))
    parser.add_argument("--sheet", default=os.getenv("CRM_SHEET_ACCOUNTS", DEFAULT_ACCOUNTS_SHEET))
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url and not args.dry_run:
        log.error("DATABASE_URL not set")
        return 1

    sheet_title = resolve_sheet_title(args.spreadsheet_id, args.sheet, gid=ACCOUNTS_GID)
    log.info("Reading sheet '%s' from spreadsheet %s", sheet_title, args.spreadsheet_id)

    rows = read_all_rows(args.spreadsheet_id, sheet_title)
    if not rows:
        log.error("Sheet is empty")
        return 1

    headers = [str(c) for c in rows[0]]
    log.info("Headers: %s", headers)

    accounts: list[dict] = []
    skipped = 0
    for row in rows[1:]:
        values = [str(c) if c is not None else "" for c in row]
        mapped = map_account_row(headers, values)
        if not mapped:
            skipped += 1
            continue
        mapped["extra"] = json.dumps(mapped.get("extra") or {})
        accounts.append(mapped)

    log.info("Parsed %d accounts (%d rows skipped)", len(accounts), skipped)

    if args.dry_run:
        for sample in accounts[:5]:
            log.info("Sample: %s", sample)
        return 0

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(cur, UPSERT_SQL, accounts, page_size=200)
        conn.commit()
        log.info("Upserted %d accounts into Neon", len(accounts))
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
