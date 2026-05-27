"""Fiction-brand anonymization for Audience Agent demo data."""

from __future__ import annotations

import json
import re
from typing import Any

# Substrings that must not appear in seeded demo-visible data (lowercase check).
FORBIDDEN_SUBSTRINGS = (
    "qbo",
    "quickbooks",
    "intuit",
    "qbopr",
    "qbse",
    "qbc_",
    "sbseg",
)

# Longest-first text replacements (case-insensitive via re.sub).
TEXT_REPLACEMENTS: list[tuple[str, str]] = [
    (r"quickbooks online payroll", "WorkforceHub"),
    (r"quickbooks capital", "GrowthCapital"),
    (r"quickbooks online", "LedgerCore"),
    (r"quickbooks", "LedgerCore"),
    (r"qbopr", "LedgerCore Payroll"),
    (r"qbc\b", "LedgerCore"),
    (r"\bqbo\b", "LedgerCore"),
    (r"\bqboa\b", "LedgerCore Admin"),
    (r"\bqboav\b", "LedgerCore Advanced"),
    (r"\bqbse\b", "LedgerCore Self-Employed"),
    (r"\bintuit\b", "Acme"),
    (r"INTUIT_OBILL", "ACME_BILLING"),
    (r"\bsbseg\b", "Acme SMB"),
    (r"\bmoney\b", "PayFlow"),
    (r"\bpayroll\b", "WorkforceHub"),
    (r"\bpayments\b", "PayFlow"),
]

TRAIT_PREFIX_REPLACEMENTS: list[tuple[str, str]] = [
    ("qbopr_", "lcp_"),
    ("qboav_", "lcav_"),
    ("qboa_", "lca_"),
    ("qbse_", "lcse_"),
    ("qbc_", "lc_"),
    ("qbo_", "lc_"),
    ("payroll_", "wh_"),
    ("payments_", "pf_"),
    ("money_", "pf_"),
]

TRAIT_KEY_OVERRIDES: dict[str, str] = {
    "qbo_skuName": "lc_sku_tier",
    "lc_skuName": "lc_sku_tier",
}

PRODUCT_MAP: dict[str, str] = {
    "QBO": "LedgerCore",
    "QuickBooks": "LedgerCore",
    "QuickBooks Capital": "GrowthCapital",
    "Payroll": "WorkforceHub",
    "Money": "PayFlow",
    "Payments": "PayFlow",
}


def anonymize_trait_key(key: str) -> str:
    if not key:
        return key
    if key in TRAIT_KEY_OVERRIDES:
        return TRAIT_KEY_OVERRIDES[key]
    out = key
    for old, new in [
        ("qbopr", "lcp"),
        ("qboa", "lca"),
        ("qboav", "lcav"),
        ("qbse", "lcse"),
        ("qbc", "lc"),
        ("qbo", "lc"),
        ("intuit", "acme"),
        ("sbseg", "acme_smb"),
        ("payroll", "wh"),
        ("payments", "pf"),
    ]:
        out = re.sub(old, new, out, flags=re.IGNORECASE)
    for old, new in TRAIT_PREFIX_REPLACEMENTS:
        if out.startswith(old):
            out = new + out[len(old) :]
            break
    return out


TRAIT_IN_CRITERIA_RE = re.compile(r"trait\(['\"]([^'\"]+)['\"]\)", re.IGNORECASE)


def anonymize_identifier(text: str | None) -> str:
    """Audience keys, campaign slugs, and display names."""
    if not text:
        return text or ""
    out = text
    for old, new in [
        ("qbopr", "lcp"),
        ("qboa", "lca"),
        ("qboav", "lcav"),
        ("qbse", "lcse"),
        ("quickbooks", "ledgercore"),
        ("qbo", "lc"),
        ("qbc", "lc"),
        ("intuit", "acme"),
        ("sbseg", "acme_smb"),
        ("mailchimp", "emailsuite"),
        ("turbotax", "taxassist"),
        ("affirm", "bnplpartner"),
    ]:
        out = re.sub(old, new, out, flags=re.IGNORECASE)
    return out


def anonymize_criteria(criteria: str | None) -> str:
    if not criteria:
        return criteria or ""

    def repl_trait(match: re.Match[str]) -> str:
        key = anonymize_trait_key(match.group(1))
        return f"trait('{key}')"

    out = TRAIT_IN_CRITERIA_RE.sub(repl_trait, criteria)
    out = anonymize_text(out)
    # Slug-like literals inside .contains('qbo_qboav_...') are not matched by \\b word rules.
    for old, new in [
        ("qbopr", "lcp"),
        ("qboav", "lcav"),
        ("qboa", "lca"),
        ("qbse", "lcse"),
        ("quickbooks", "ledgercore"),
        ("qbo", "lc"),
        ("qbc", "lc"),
        ("intuit", "acme"),
        ("sbseg", "acme_smb"),
    ]:
        out = re.sub(old, new, out, flags=re.IGNORECASE)
    return out


def anonymize_text(text: str | None) -> str:
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    if not text:
        return ""
    out = text
    for pattern, repl in TEXT_REPLACEMENTS:
        out = re.sub(pattern, repl, out, flags=re.IGNORECASE)
    return out


def anonymize_products(products: list[str] | None) -> list[str]:
    if not products:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for p in products:
        mapped = PRODUCT_MAP.get(p, anonymize_text(p))
        if mapped and mapped not in seen:
            seen.add(mapped)
            out.append(mapped)
    return out or ["LedgerCore"]


def anonymize_traits(traits: list[str] | None) -> list[str]:
    if not traits:
        return []
    return list(dict.fromkeys(anonymize_trait_key(t) for t in traits if t))


def anonymize_json_row(row: dict[str, Any], fields: list[str]) -> dict[str, Any]:
    out = dict(row)
    for field in fields:
        if field not in out or out[field] is None:
            continue
        val = out[field]
        if isinstance(val, str):
            out[field] = anonymize_text(val)
        elif isinstance(val, list) and val and isinstance(val[0], str):
            if field in ("attributes", "trait_key", "traits"):
                out[field] = anonymize_traits(val)
            elif field == "products":
                out[field] = anonymize_products(val)
            else:
                out[field] = [anonymize_text(v) for v in val]
    return out


def contains_forbidden(text: str) -> list[str]:
    lower = (text or "").lower()
    return [s for s in FORBIDDEN_SUBSTRINGS if s in lower]


def validate_row_text(*values: str | None) -> list[str]:
    hits: list[str] = []
    for val in values:
        if not val:
            continue
        hits.extend(contains_forbidden(val))
    return list(dict.fromkeys(hits))


def anonymize_manifest_json(manifest: dict[str, Any]) -> dict[str, Any]:
    out = json.loads(json.dumps(manifest))
    if "segment_expression" in out and out["segment_expression"]:
        out["segment_expression"] = anonymize_text(out["segment_expression"])
    for row in out.get("criteria", []):
        if isinstance(row, dict):
            if row.get("criterion"):
                row["criterion"] = anonymize_text(str(row["criterion"]))
            if row.get("trait"):
                row["trait"] = anonymize_trait_key(str(row["trait"]))
    return out
