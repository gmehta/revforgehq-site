#!/usr/bin/env python3
"""
Push Neon CRM (leads + accounts) to the GTM Google Sheet backup (upsert only, no deletes).

Mirrors Cloudflare /api/crm/sync for local testing.

Usage:
    python scripts/sync_crm_to_sheet.py --dry-run
    python scripts/sync_crm_to_sheet.py
    python scripts/sync_crm_to_sheet.py --leads-only
    python scripts/sync_crm_to_sheet.py --accounts-only
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from lib.crm_sheet_mapping import (  # noqa: E402
    ACCOUNT_SHEET_COLUMNS,
    DEFAULT_ACCOUNTS_SHEET,
    DEFAULT_LEADS_SHEET,
    DEFAULT_SPREADSHEET_ID,
    LEAD_SHEET_COLUMNS,
)
from lib.google_sheets import (  # noqa: E402
    append_rows,
    batch_update_rows,
    build_id_row_index,
    ensure_headers,
    read_all_rows,
    resolve_sheet_title,
    with_retry,
)

load_dotenv(ROOT / ".env", override=False)
load_dotenv(ROOT / ".dev.vars", override=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

ACCOUNTS_GID = 466934255
BATCH_SIZE = 200


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync Neon CRM to Google Sheet backup")
    parser.add_argument("--spreadsheet-id", default=os.getenv("CRM_SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID))
    parser.add_argument("--leads-sheet", default=os.getenv("CRM_SHEET_LEADS", DEFAULT_LEADS_SHEET))
    parser.add_argument("--accounts-sheet", default=os.getenv("CRM_SHEET_ACCOUNTS", DEFAULT_ACCOUNTS_SHEET))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--full", action="store_true", help="Full sync (ignore watermark)")
    parser.add_argument("--leads-only", action="store_true")
    parser.add_argument("--accounts-only", action="store_true")
    return parser.parse_args()


def fmt_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return str(value)


def row_to_values(record: dict[str, Any], columns: list[tuple[str, str]]) -> list[str]:
    return [fmt_cell(record.get(field)) for field, _ in columns]


def fetch_leads(conn, watermark: datetime | None, full: bool) -> list[dict]:
    with conn.cursor() as cur:
        if full or watermark is None:
            cur.execute(
                """
                SELECT l.*, a.domain AS domain
                FROM leads l
                LEFT JOIN accounts a ON a.company_key = l.company_key
                ORDER BY l.id
                """
            )
        else:
            cur.execute(
                """
                SELECT l.*, a.domain AS domain
                FROM leads l
                LEFT JOIN accounts a ON a.company_key = l.company_key
                WHERE l.updated_at > %s
                ORDER BY l.id
                """,
                (watermark,),
            )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def fetch_accounts(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM accounts ORDER BY id")
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_watermark(conn, key: str) -> datetime | None:
    with conn.cursor() as cur:
        cur.execute("SELECT last_lead_updated_at FROM crm_sync_state WHERE key = %s", (key,))
        row = cur.fetchone()
        return row[0] if row and row[0] else None


def record_sync_run(
    conn,
    run_type: str,
    leads_count: int,
    accounts_count: int,
    errors: list[str] | None,
    watermark: datetime | None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO crm_sync_runs (run_type, finished_at, leads_upserted, accounts_upserted, errors)
            VALUES (%s, NOW(), %s, %s, %s)
            """,
            (run_type, leads_count, accounts_count, json.dumps(errors) if errors else None),
        )
        if watermark is not None:
            cur.execute(
                """
                INSERT INTO crm_sync_state (key, last_success_at, last_lead_updated_at)
                VALUES ('leads_to_sheet', NOW(), %s)
                ON CONFLICT (key) DO UPDATE SET
                    last_success_at = NOW(),
                    last_lead_updated_at = GREATEST(
                        COALESCE(crm_sync_state.last_lead_updated_at, 'epoch'::timestamptz),
                        EXCLUDED.last_lead_updated_at
                    )
                """,
                (watermark,),
            )
        cur.execute(
            """
            INSERT INTO crm_sync_state (key, last_success_at)
            VALUES ('accounts_to_sheet', NOW())
            ON CONFLICT (key) DO UPDATE SET last_success_at = NOW()
            """
        )
    conn.commit()


def upsert_to_sheet(
    spreadsheet_id: str,
    sheet_title: str,
    id_header: str,
    headers: list[str],
    records: list[dict],
    columns: list[tuple[str, str]],
    dry_run: bool,
) -> int:
    if not records:
        return 0

    sheet_rows = read_all_rows(spreadsheet_id, sheet_title)
    if not sheet_rows:
        ensure_headers(spreadsheet_id, sheet_title, headers)
        sheet_rows = [headers]

    _, id_index = build_id_row_index(sheet_rows, id_header)
    updates: list[tuple[int, list[Any]]] = []
    appends: list[list[Any]] = []

    for record in records:
        row_id = str(record.get(columns[0][0], "")).strip()
        if not row_id:
            continue
        values = row_to_values(record, columns)
        row_num = id_index.get(row_id)
        if row_num:
            updates.append((row_num, values))
        else:
            appends.append(values)

    log.info("%s: %d updates, %d appends", sheet_title, len(updates), len(appends))
    if dry_run:
        return len(updates) + len(appends)

    count = 0
    for i in range(0, len(updates), BATCH_SIZE):
        chunk = updates[i : i + BATCH_SIZE]
        count += with_retry(lambda c=chunk: batch_update_rows(spreadsheet_id, sheet_title, c, headers))
    for i in range(0, len(appends), BATCH_SIZE):
        chunk = appends[i : i + BATCH_SIZE]
        count += with_retry(lambda c=chunk: append_rows(spreadsheet_id, sheet_title, c))
    return count


def sync_leads(conn, args) -> tuple[int, datetime | None]:
    lead_headers = [h for _, h in LEAD_SHEET_COLUMNS]
    sheet_title = resolve_sheet_title(args.spreadsheet_id, args.leads_sheet)
    watermark = None if args.full else get_watermark(conn, "leads_to_sheet")
    run_type = "full" if args.full or watermark is None else "incremental"
    leads = fetch_leads(conn, watermark, args.full)
    log.info("Syncing %d leads (%s)", len(leads), run_type)

    max_updated = max((r.get("updated_at") for r in leads if r.get("updated_at")), default=None)
    count = upsert_to_sheet(
        args.spreadsheet_id,
        sheet_title,
        "Lead ID",
        lead_headers,
        leads,
        LEAD_SHEET_COLUMNS,
        args.dry_run,
    )
    return count, max_updated


def sync_accounts(conn, args) -> int:
    account_headers = [h for _, h in ACCOUNT_SHEET_COLUMNS]
    sheet_title = resolve_sheet_title(args.spreadsheet_id, args.accounts_sheet, gid=ACCOUNTS_GID)
    accounts = fetch_accounts(conn)
    log.info("Syncing %d accounts", len(accounts))
    return upsert_to_sheet(
        args.spreadsheet_id,
        sheet_title,
        "Account ID",
        account_headers,
        accounts,
        ACCOUNT_SHEET_COLUMNS,
        args.dry_run,
    )


def main() -> int:
    args = parse_args()
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        log.error("DATABASE_URL not set")
        return 1

    sync_leads_flag = not args.accounts_only
    sync_accounts_flag = not args.leads_only

    conn = psycopg2.connect(database_url)
    errors: list[str] = []
    leads_count = 0
    accounts_count = 0
    watermark = None

    try:
        if sync_leads_flag:
            try:
                leads_count, watermark = sync_leads(conn, args)
            except Exception as exc:
                errors.append(f"leads: {exc}")
                log.exception("Leads sync failed")

        if sync_accounts_flag:
            try:
                accounts_count = sync_accounts(conn, args)
            except Exception as exc:
                errors.append(f"accounts: {exc}")
                log.exception("Accounts sync failed")

        if not args.dry_run and not errors:
            run_type = "full" if args.full else "incremental"
            record_sync_run(conn, run_type, leads_count, accounts_count, None, watermark)
        elif not args.dry_run and errors:
            record_sync_run(conn, "partial", leads_count, accounts_count, errors, None)

        log.info("Done — leads: %d, accounts: %d", leads_count, accounts_count)
        return 1 if errors else 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
