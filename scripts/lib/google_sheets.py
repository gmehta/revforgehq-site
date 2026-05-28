"""Google Sheets API helpers for CRM sync scripts (service account auth)."""

from __future__ import annotations

import json
import os
import time
from typing import Any

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def load_service_account_info() -> dict[str, Any]:
    raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON is not set")
    return json.loads(raw)


def get_sheets_service():
    info = load_service_account_info()
    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def get_spreadsheet_meta(spreadsheet_id: str) -> dict[str, Any]:
    service = get_sheets_service()
    return service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()


def resolve_sheet_title(spreadsheet_id: str, preferred: str, gid: int | None = None) -> str:
    meta = get_spreadsheet_meta(spreadsheet_id)
    sheets = meta.get("sheets", [])
    titles = [s["properties"]["title"] for s in sheets]
    if preferred in titles:
        return preferred
    if gid is not None:
        for sheet in sheets:
            props = sheet.get("properties", {})
            if props.get("sheetId") == gid:
                return props["title"]
    if titles:
        return titles[0]
    raise RuntimeError("Spreadsheet has no sheets")


def read_sheet_values(spreadsheet_id: str, sheet_title: str, range_a1: str) -> list[list[str]]:
    service = get_sheets_service()
    full_range = f"'{sheet_title}'!{range_a1}"
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=full_range, valueRenderOption="FORMATTED_VALUE")
        .execute()
    )
    return result.get("values", [])


def read_all_rows(spreadsheet_id: str, sheet_title: str) -> list[list[str]]:
    return read_sheet_values(spreadsheet_id, sheet_title, "A:ZZ")


def build_id_row_index(rows: list[list[str]], id_header: str) -> tuple[list[str], dict[str, int]]:
    if not rows:
        return [], {}
    headers = [str(c) for c in rows[0]]
    norm_headers = [h.strip().lower() for h in headers]
    try:
        id_col = norm_headers.index(id_header.strip().lower())
    except ValueError:
        raise RuntimeError(f"ID column '{id_header}' not found in headers: {headers}")

    index: dict[str, int] = {}
    for row_num, row in enumerate(rows[1:], start=2):
        if id_col >= len(row):
            continue
        row_id = str(row[id_col]).strip()
        if row_id:
            index[row_id] = row_num
    return headers, index


def batch_update_rows(
    spreadsheet_id: str,
    sheet_title: str,
    updates: list[tuple[int, list[Any]]],
    headers: list[str],
) -> int:
    if not updates:
        return 0
    service = get_sheets_service()
    end_col = chr(ord("A") + max(len(headers) - 1, 0))
    data = []
    for row_num, values in updates:
        range_a1 = f"'{sheet_title}'!A{row_num}:{end_col}{row_num}"
        data.append({"range": range_a1, "values": [values]})
    body = {"valueInputOption": "USER_ENTERED", "data": data}
    service.spreadsheets().values().batchUpdate(spreadsheetId=spreadsheet_id, body=body).execute()
    return len(updates)


def append_rows(spreadsheet_id: str, sheet_title: str, rows: list[list[Any]]) -> int:
    if not rows:
        return 0
    service = get_sheets_service()
    body = {"values": rows}
    (
        service.spreadsheets()
        .values()
        .append(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_title}'!A:A",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body=body,
        )
        .execute()
    )
    return len(rows)


def ensure_headers(
    spreadsheet_id: str,
    sheet_title: str,
    headers: list[str],
    *,
    force: bool = False,
) -> None:
    existing = read_sheet_values(spreadsheet_id, sheet_title, "1:1")
    if existing and existing[0] and not force:
        return
    service = get_sheets_service()
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"'{sheet_title}'!A1",
        valueInputOption="USER_ENTERED",
        body={"values": [headers]},
    ).execute()


def with_retry(fn, max_attempts: int = 5):
    delay = 1.0
    for attempt in range(max_attempts):
        try:
            return fn()
        except HttpError as err:
            status = err.resp.status if err.resp else 0
            if status in (429, 500, 503) and attempt < max_attempts - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise


def get_sheet_id(spreadsheet_id: str, sheet_title: str, gid: int | None = None) -> int:
    meta = get_spreadsheet_meta(spreadsheet_id)
    for sheet in meta.get("sheets", []):
        props = sheet.get("properties", {})
        if props.get("title") == sheet_title:
            return int(props["sheetId"])
        if gid is not None and props.get("sheetId") == gid:
            return int(props["sheetId"])
    raise RuntimeError(f"Sheet '{sheet_title}' not found")


def delete_sheet_rows(
    spreadsheet_id: str,
    sheet_id: int,
    start_row_1based: int,
    end_row_1based: int,
) -> None:
    """Delete inclusive 1-based row range [start_row_1based, end_row_1based]."""
    if start_row_1based > end_row_1based:
        return
    service = get_sheets_service()
    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={
            "requests": [
                {
                    "deleteDimension": {
                        "range": {
                            "sheetId": sheet_id,
                            "dimension": "ROWS",
                            "startIndex": start_row_1based - 1,
                            "endIndex": end_row_1based,
                        }
                    }
                }
            ]
        },
    ).execute()
