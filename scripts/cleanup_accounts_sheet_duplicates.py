#!/usr/bin/env python3
"""
Remove legacy duplicate account rows from the GTM Google Sheet.

Legacy rows have company names in the Account ID column (pre-Neon layout).
Neon-backed rows use acc_* IDs. This script deletes rows without a valid acc_* ID
when a Neon-backed row exists for the same company.

Usage:
    python scripts/cleanup_accounts_sheet_duplicates.py --dry-run
    python scripts/cleanup_accounts_sheet_duplicates.py --execute
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from lib.crm_sheet_mapping import (  # noqa: E402
    DEFAULT_ACCOUNTS_SHEET,
    DEFAULT_SPREADSHEET_ID,
    is_neon_account_id,
    normalize_company_key,
)
from lib.google_sheets import (  # noqa: E402
    delete_sheet_rows,
    get_sheet_id,
    read_all_rows,
    resolve_sheet_title,
    with_retry,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

ACCOUNTS_GID = 466934255


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Remove legacy duplicate Accounts sheet rows")
    parser.add_argument("--spreadsheet-id", default=os.getenv("CRM_SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID))
    parser.add_argument("--sheet", default=os.getenv("CRM_SHEET_ACCOUNTS", DEFAULT_ACCOUNTS_SHEET))
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Report rows that would be deleted")
    group.add_argument("--execute", action="store_true", help="Delete legacy duplicate rows")
    return parser.parse_args()


def find_rows_to_delete(rows: list[list[str]]) -> list[int]:
    if len(rows) <= 1:
        return []

    headers = [str(c).strip().lower() for c in rows[0]]
    try:
        id_col = headers.index("account id")
    except ValueError as exc:
        raise RuntimeError(f"Account ID column not found in headers: {rows[0]}") from exc

    company_col = headers.index("company name") if "company name" in headers else -1

    neon_company_keys: set[str] = set()
    for row in rows[1:]:
        id_val = str(row[id_col]).strip() if id_col < len(row) else ""
        if not is_neon_account_id(id_val):
            continue
        company_val = str(row[company_col]).strip() if company_col >= 0 and company_col < len(row) else ""
        if company_val:
            neon_company_keys.add(normalize_company_key(company_val))

    delete_rows: list[int] = []
    for row_num, row in enumerate(rows[1:], start=2):
        id_val = str(row[id_col]).strip() if id_col < len(row) else ""
        if is_neon_account_id(id_val):
            continue

        legacy_key = normalize_company_key(id_val) if id_val else ""
        company_val = str(row[company_col]).strip() if company_col >= 0 and company_col < len(row) else ""
        company_key = normalize_company_key(company_val) if company_val else ""

        if legacy_key and legacy_key in neon_company_keys:
            delete_rows.append(row_num)
        elif company_key and company_key in neon_company_keys:
            delete_rows.append(row_num)
        elif not id_val and not company_val:
            delete_rows.append(row_num)

    return delete_rows


def merge_contiguous_rows(row_nums: list[int]) -> list[tuple[int, int]]:
    if not row_nums:
        return []
    sorted_rows = sorted(row_nums)
    ranges: list[tuple[int, int]] = []
    start = prev = sorted_rows[0]
    for row in sorted_rows[1:]:
        if row == prev + 1:
            prev = row
            continue
        ranges.append((start, prev))
        start = prev = row
    ranges.append((start, prev))
    return ranges


def main() -> int:
    load_dotenv(ROOT / ".env", override=False)
    load_dotenv(ROOT / ".dev.vars", override=False)
    args = parse_args()

    sheet_title = resolve_sheet_title(args.spreadsheet_id, args.sheet, gid=ACCOUNTS_GID)
    rows = read_all_rows(args.spreadsheet_id, sheet_title)
    delete_rows = find_rows_to_delete(rows)
    ranges = merge_contiguous_rows(delete_rows)

    log.info("Sheet '%s' has %d data rows", sheet_title, max(len(rows) - 1, 0))
    log.info("Legacy duplicate rows to delete: %d", len(delete_rows))
    for start, end in ranges[:10]:
        log.info("  rows %d-%d (%d rows)", start, end, end - start + 1)
    if len(ranges) > 10:
        log.info("  ... and %d more ranges", len(ranges) - 10)

    if not delete_rows:
        log.info("Nothing to delete.")
        return 0

    if args.dry_run:
        log.info("Dry run only — pass --execute to delete.")
        return 0

    sheet_id = get_sheet_id(args.spreadsheet_id, sheet_title, gid=ACCOUNTS_GID)
    for start, end in sorted(ranges, reverse=True):
        log.info("Deleting rows %d-%d", start, end)
        with_retry(lambda s=start, e=end: delete_sheet_rows(args.spreadsheet_id, sheet_id, s, e))

    remaining = read_all_rows(args.spreadsheet_id, sheet_title)
    log.info("Done — %d data rows remain", max(len(remaining) - 1, 0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
