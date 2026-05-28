"""Column mappings between Neon CRM tables and the GTM Google Sheet backup."""

from __future__ import annotations

import hashlib
import re
from typing import Any

DEFAULT_SPREADSHEET_ID = "16lpxRX-flWP_blM_Rvq-_rc6ktZFUvBpjqp7eCmLtWs"
DEFAULT_ACCOUNTS_SHEET = "Accounts"
DEFAULT_LEADS_SHEET = "Leads"

# Sheet header -> accounts table field (None = store in extra JSONB)
ACCOUNT_HEADER_MAP: dict[str, str | None] = {
    "account id": "id",
    "id": "id",
    "company": "company_name",
    "company name": "company_name",
    "name": "company_name",
    "domain": "domain",
    "website": "domain",
    "company domain": "domain",
    "segment": "segment",
    "industry": "segment",
    "category": "segment",
    "stack": "segment",
    "vertical": "segment",
    "tier": "tier",
    "priority": "tier",
    "gtm tier": "tier",
    "status": "status",
    "notes": "notes",
    "comments": "notes",
}

# Neon field -> sheet header (export order)
LEAD_SHEET_COLUMNS: list[tuple[str, str]] = [
    ("id", "Lead ID"),
    ("first_name", "First Name"),
    ("last_name", "Last Name"),
    ("full_name", "Full Name"),
    ("company", "Company"),
    ("title", "Job Title"),
    ("linkedin_url", "LinkedIn URL"),
    ("domain", "Company Domain"),
    ("email", "Email"),
    ("gtm_tier", "GTM Tier"),
    ("gtm_tier_reason", "GTM Tier Reason"),
    ("lead_source", "Lead Source"),
    ("outreach_status", "Outreach Status"),
    ("tier", "Adobe Tier"),
    ("score", "Score"),
    ("updated_at", "Last Synced At"),
]

ACCOUNT_SHEET_COLUMNS: list[tuple[str, str]] = [
    ("id", "Account ID"),
    ("company_name", "Company Name"),
    ("domain", "Domain"),
    ("segment", "Segment"),
    ("tier", "Tier"),
    ("status", "Status"),
    ("notes", "Notes"),
    ("updated_at", "Last Synced At"),
]


def normalize_header(header: str) -> str:
    return re.sub(r"\s+", " ", (header or "").strip().lower())


def normalize_company_key(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def account_id_from_key(company_key: str) -> str:
    digest = hashlib.sha256(company_key.encode("utf-8")).hexdigest()[:12]
    return f"acc_{digest}"


def parse_tier(value: Any) -> int | None:
    text = str(value or "").strip()
    if not text:
        return None
    match = re.search(r"\d+", text)
    if not match:
        return None
    tier = int(match.group())
    return tier if 1 <= tier <= 3 else None


def map_account_row(headers: list[str], values: list[str]) -> dict[str, Any]:
    """Map a sheet row to an accounts table dict."""
    row: dict[str, str] = {}
    extra: dict[str, str] = {}
    for idx, header in enumerate(headers):
        cell = values[idx] if idx < len(values) else ""
        row[normalize_header(header)] = (cell or "").strip()

    mapped: dict[str, Any] = {"extra": extra}
    used_headers: set[str] = set()

    for norm_header, field in ACCOUNT_HEADER_MAP.items():
        if norm_header not in row or field is None:
            continue
        if norm_header in used_headers:
            continue
        used_headers.add(norm_header)
        value = row[norm_header]
        if field == "tier":
            mapped["tier"] = parse_tier(value)
        elif field == "id" and value:
            mapped["id"] = value
        elif value:
            mapped[field] = value

    company_name = mapped.get("company_name") or row.get("company name") or row.get("company") or row.get("name")
    if not company_name:
        return {}

    mapped["company_name"] = company_name
    mapped["company_key"] = normalize_company_key(company_name)
    mapped.setdefault("id", account_id_from_key(mapped["company_key"]))

    for norm_header, raw in row.items():
        if norm_header in used_headers or not raw:
            continue
        if norm_header in ACCOUNT_HEADER_MAP and ACCOUNT_HEADER_MAP[norm_header] is not None:
            continue
        extra[norm_header] = raw

    domain = mapped.get("domain") or ""
    if domain:
        domain = re.sub(r"^https?://", "", domain, flags=re.I).split("/")[0].lower()
        mapped["domain"] = domain

    return mapped
