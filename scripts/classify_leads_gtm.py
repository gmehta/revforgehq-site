#!/usr/bin/env python3
"""
Classify all leads into GTM outreach tiers by title rules.

Tier 1 — Direct buyers (decision-makers)
Tier 2 — Champions / power users (operator titles + Director+ seniority)
Tier 3 — AI-forward adjacent roles

Usage:
    python scripts/classify_leads_gtm.py --dry-run
    python scripts/classify_leads_gtm.py --output scripts/output/leads_gtm_tiers.csv
    python scripts/classify_leads_gtm.py --from-db
    python scripts/classify_leads_gtm.py --write-db
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "scripts" / "output"

load_dotenv(ROOT / ".env", override=False)
load_dotenv(ROOT / ".dev.vars", override=False)

TIER1_PHRASES = [
    "chief revenue officer",
    "chief marketing officer",
    "chief growth officer",
    "chief digital officer",
    "chief customer officer",
    "president of sales",
    "president of marketing",
    "svp revenue",
    "evp revenue",
    "svp marketing",
    "evp marketing",
    "vp revenue operations",
    "vp revops",
    "vp marketing operations",
    "vp marops",
    "vp sales operations",
    "vp salesops",
    "vp growth",
    "vp demand generation",
    "head of revenue",
    "head of gtm",
    "head of go-to-market",
    "head of revops",
]

TIER1_ACRONYMS = ["cro", "cmo", "cgo"]

TIER2_KEYWORDS = [
    "revops",
    "rev ops",
    "revenue operations",
    "marops",
    "mar ops",
    "marketing operations",
    "salesops",
    "sales ops",
    "sales operations",
    "gtm strategy",
    "gtm operations",
    "go-to-market",
    "demand generation",
    "demand gen",
    "marketing technology",
    "martech",
    "marketing automation",
    "marketing analytics",
    "pipeline operations",
    "sales enablement",
    "growth marketing",
    "lifecycle marketing",
    "customer lifecycle",
    "account-based marketing",
    "performance marketing",
    "customer data platform",
    "marketing cloud",
    "abm",
    "cdp",
]

TIER2_SENIORITY = [
    "senior director",
    "sr. director",
    "sr director",
    "director",
    "head of",
    "vice president",
    "vp ",
    " vp",
    "vp,",
    "vp-",
]

TIER3_PHRASES = [
    "ai strategy",
    "ai transformation",
    "marketing ai",
    "sales ai",
    "ai product",
]

TIER3_CONTEXT = re.compile(
    r"(marketing|revenue|sales|gtm|go-to-market|growth|digital|customer)",
    re.I,
)


def normalize_title(title: str) -> str:
    return re.sub(r"\s+", " ", (title or "").strip().lower())


def matches_tier1(title: str) -> str | None:
    t = normalize_title(title)
    if not t:
        return None
    for phrase in TIER1_PHRASES:
        if phrase in t:
            if phrase == "president of marketing" and re.search(r"\bvice president\b", t):
                continue
            if phrase == "president of sales" and re.search(r"\bvice president\b", t):
                continue
            return phrase
    for acr in TIER1_ACRONYMS:
        if re.search(rf"\b{re.escape(acr)}\b", t):
            return acr
    return None


def has_seniority(title: str) -> bool:
    t = normalize_title(title)
    if not t:
        return False
    if re.search(r"\b(svp|evp|chief|president)\b", t):
        return True
    for gate in TIER2_SENIORITY:
        if gate.strip() in ("vp",):
            continue
        if gate in t:
            return True
    if re.search(r"\bvp\b", t):
        return True
    return False


def matches_tier2(title: str) -> str | None:
    t = normalize_title(title)
    if not t or not has_seniority(t):
        return None
    for kw in TIER2_KEYWORDS:
        if kw == "cdp" or kw == "abm":
            if re.search(rf"\b{re.escape(kw)}\b", t):
                return kw
        elif kw in t:
            return kw
    return None


def matches_tier3(title: str) -> str | None:
    t = normalize_title(title)
    if not t:
        return None
    for phrase in TIER3_PHRASES:
        if phrase in t:
            return phrase
    if re.search(r"\bhead of ai\b", t) and TIER3_CONTEXT.search(t):
        return "head of ai + gtm context"
    if "innovation" in t and TIER3_CONTEXT.search(t):
        return "innovation + gtm context"
    if "digital transformation" in t and TIER3_CONTEXT.search(t):
        return "digital transformation + gtm context"
    return None


def classify_title(title: str) -> tuple[int | None, str]:
    t1 = matches_tier1(title)
    if t1:
        return 1, f"Tier 1: matched '{t1}'"
    t2 = matches_tier2(title)
    if t2:
        return 2, f"Tier 2: matched '{t2}' + Director+ seniority"
    t3 = matches_tier3(title)
    if t3:
        return 3, f"Tier 3: matched '{t3}'"
    return None, "Unclassified"


def fetch_leads_from_db(database_url: str) -> list[dict]:
    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, full_name, first_name, last_name, company, title,
                       email, lead_source, linkedin_url, outreach_status,
                       tier AS legacy_tier, score
                FROM leads
                ORDER BY lead_source, id
                """
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Classify leads into GTM tiers")
    parser.add_argument("--from-db", action="store_true", default=True, help="Load from Neon (default)")
    parser.add_argument("--dry-run", action="store_true", help="Print stats only")
    parser.add_argument("--write-db", action="store_true", help="Write gtm_tier columns back to Neon")
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_DIR / f"leads_gtm_tiers_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.csv",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL not set", file=sys.stderr)
        return 1

    rows = fetch_leads_from_db(database_url)
    classified: list[dict] = []
    tier_counts: Counter[int | str] = Counter()

    for row in rows:
        gtm_tier, gtm_reason = classify_title(row.get("title") or "")
        key: int | str = gtm_tier if gtm_tier is not None else "unclassified"
        tier_counts[key] += 1
        classified.append(
            {
                "id": row["id"],
                "full_name": row.get("full_name") or "",
                "company": row.get("company") or "",
                "title": row.get("title") or "",
                "email": row.get("email") or "",
                "lead_source": row.get("lead_source") or "",
                "linkedin_url": row.get("linkedin_url") or "",
                "gtm_tier": gtm_tier if gtm_tier is not None else "",
                "gtm_tier_reason": gtm_reason,
                "legacy_tier": row.get("legacy_tier") or "",
                "legacy_score": row.get("score") or "",
                "outreach_status": row.get("outreach_status") or "",
            }
        )

    print(f"Classified {len(classified)} leads")
    for tier in [1, 2, 3, "unclassified"]:
        count = tier_counts.get(tier, 0)
        with_email = sum(1 for r in classified if r["gtm_tier"] == tier and r["email"])
        if tier == "unclassified":
            with_email = sum(1 for r in classified if r["gtm_tier"] == "" and r["email"])
        label = f"Tier {tier}" if tier != "unclassified" else "Unclassified"
        print(f"  {label}: {count} ({with_email} with email)")

    by_source = Counter(
        (r["lead_source"], r["gtm_tier"] if r["gtm_tier"] != "" else "unclassified")
        for r in classified
    )
    print("\nBy source:")
    for (source, tier), count in sorted(by_source.items(), key=lambda x: (x[0][0], str(x[0][1]))):
        print(f"  {source} / tier {tier}: {count}")

    if args.dry_run:
        return 0

    if args.write_db:
        conn = psycopg2.connect(database_url)
        try:
            staging: list[tuple] = []
            for row in classified:
                tier = row["gtm_tier"] if row["gtm_tier"] != "" else None
                staging.append((row["id"], tier, row["gtm_tier_reason"]))
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TEMP TABLE gtm_tier_staging (
                        id TEXT PRIMARY KEY,
                        gtm_tier SMALLINT,
                        gtm_tier_reason TEXT
                    ) ON COMMIT DROP
                    """
                )
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO gtm_tier_staging (id, gtm_tier, gtm_tier_reason) VALUES %s",
                    staging,
                    page_size=1000,
                )
                cur.execute(
                    """
                    UPDATE leads AS l
                    SET gtm_tier = s.gtm_tier,
                        gtm_tier_reason = s.gtm_tier_reason,
                        updated_at = NOW()
                    FROM gtm_tier_staging AS s
                    WHERE l.id = s.id
                    """
                )
            conn.commit()
            print(f"Updated gtm_tier on {len(classified)} leads in Neon", flush=True)
        finally:
            conn.close()
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "id",
        "full_name",
        "company",
        "title",
        "email",
        "lead_source",
        "linkedin_url",
        "gtm_tier",
        "gtm_tier_reason",
        "legacy_tier",
        "legacy_score",
        "outreach_status",
    ]
    with args.output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(classified)

    print(f"\nWrote {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
