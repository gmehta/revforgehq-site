#!/usr/bin/env python3
"""
AgenticMOps — Seed Neon Postgres with Audience Agent synthetic / eval data.

Loads segment-extract JSONL, attribute mapping seeds, eval outputs, and
optionally Neo4j campaign metadata + graph edges into Neon.

Usage:
    export DATABASE_URL='postgresql://...'
    psql "$DATABASE_URL" -f scripts/sql/neon_schema.sql
    python scripts/seed_neon_audience.py
    python scripts/seed_neon_audience.py --dry-run
    python scripts/seed_neon_audience.py --skip-neo4j
    python scripts/seed_neon_audience.py --truncate
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone, date, timedelta
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
SEG_DIR = ROOT / "segment-extract"
OUTPUT_DIR = ROOT / "scripts" / "output"

sys.path.insert(0, str(ROOT / "scripts"))
from lib.anonymize import (  # noqa: E402
    anonymize_criteria,
    anonymize_identifier,
    anonymize_manifest_json,
    anonymize_products,
    anonymize_text,
    anonymize_trait_key,
    anonymize_traits,
    contains_forbidden,
)

load_dotenv(ROOT / ".env", override=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

ELM_KEY_RE = re.compile(r"^elm_(\d+)(?:_|$)", re.I)
TRAIT_RE = re.compile(r"trait\(['\"]([^'\"]+)['\"]\)", re.I)

# Seed attribute mappings from knowledge-graph/seed/attribute-mappings.cypher
ATTRIBUTE_MAPPINGS = [
    {
        "id": "map-legacy-zip-to-geo-postal-segment",
        "spec_name": "Legacy_Zip_Code",
        "system_name": "Geo_Postal_Point",
        "system": "segment_cdp",
        "data_type": "string",
        "nl_operator": None,
        "status": "active",
        "notes": "SOT zip code → Segment Geo_Postal_Point",
        "nl_phrases": ["zip code", "postal code", "legacy zip", "us zip code", "zip code filter"],
    },
    {
        "id": "map-legacy-zip-to-postal-code-eloqua",
        "spec_name": "Legacy_Zip_Code",
        "system_name": "postal_code_c",
        "system": "eloqua",
        "data_type": "string",
        "nl_operator": None,
        "status": "active",
        "notes": "Eloqua postal code field",
        "nl_phrases": ["zip code", "postal code", "legacy zip", "us zip code"],
    },
    {
        "id": "map-state-to-geo-region-segment",
        "spec_name": "State",
        "system_name": "geo_region",
        "system": "segment_cdp",
        "data_type": "string",
        "nl_operator": "= 'US'",
        "status": "active",
        "notes": "SOT State → geo_region",
        "nl_phrases": ["state", "us state", "region", "geographic region", "us only", "united states only"],
    },
    {
        "id": "map-product-name-to-product-line-segment",
        "spec_name": "Product",
        "system_name": "product_line",
        "system": "segment_cdp",
        "data_type": "string",
        "nl_operator": None,
        "status": "active",
        "notes": "SOT Product → product_line",
        "nl_phrases": ["product", "product line", "ledgercore product", "core product line", "product family"],
    },
    {
        "id": "map-subscription-status-to-sub-state-segment",
        "spec_name": "Subscription_Status",
        "system_name": "subscription_state",
        "system": "segment_cdp",
        "data_type": "string",
        "nl_operator": "= 'ACTIVE'",
        "status": "active",
        "notes": "SOT subscription status",
        "nl_phrases": [
            "active subscription", "paid subscription", "subscription status",
            "trial", "cancelled subscription", "inactive subscription", "subscribed",
        ],
    },
    {
        "id": "map-days-since-login-to-last-active-segment",
        "spec_name": "Days_Since_Last_Login",
        "system_name": "days_since_last_active",
        "system": "segment_cdp",
        "data_type": "number",
        "nl_operator": "> 30",
        "status": "active",
        "notes": "SOT recency / days since login",
        "nl_phrases": [
            "days since login", "days since last active", "recency", "last login",
            "inactive for", "not logged in", "days inactive", "last activity",
        ],
    },
    {
        "id": "map-tenure-to-account-age-days-segment",
        "spec_name": "Tenure",
        "system_name": "account_age_days",
        "system": "segment_cdp",
        "data_type": "number",
        "nl_operator": None,
        "status": "active",
        "notes": "SOT tenure → account_age_days",
        "nl_phrases": [
            "tenure", "account age", "years as customer", "months as customer",
            "subscription age", "customer since", "long-standing customer",
            "2 year", "3 year", "4 year",
        ],
    },
    {
        "id": "map-company-size-to-employee-count-segment",
        "spec_name": "Company_Size",
        "system_name": "employee_count_bucket",
        "system": "segment_cdp",
        "data_type": "string",
        "nl_operator": None,
        "status": "active",
        "notes": "SOT company size",
        "nl_phrases": [
            "company size", "number of employees", "employee count", "headcount",
            "1 employee", "5+ employees", "5 or more employees", "small business",
            "solopreneur", "single employee",
        ],
    },
    {
        "id": "map-revenue-band-to-arr-bucket-segment",
        "spec_name": "Revenue_Band",
        "system_name": "arr_bucket",
        "system": "segment_cdp",
        "data_type": "string",
        "nl_operator": None,
        "status": "active",
        "notes": "SOT revenue band → arr_bucket",
        "nl_phrases": [
            "revenue band", "annual revenue", "arr", "revenue tier", "high revenue",
            "high value biller", "hvb", "top revenue customers", "revenue segment",
        ],
    },
]

# Common Segment trait → NL concept hints for manifest building
TRAIT_NL_HINTS = {
    "lc_sku_tier": "Core SKU / product tier",
    "lc_regionMD": "US region",
    "lc_entitlementState": "active entitlement",
    "lc_subscriptionStatus": "paid subscription",
    "lc_charge_frequencyMD": "billing frequency",
    "lc_hasactivediscount": "no active discount",
    "lc_subscriptionStartDate": "subscription tenure",
    "pf_entitlementState": "exclude PayFlow subscribers",
    "wholesale_partner_clients": "exclude wholesale",
    "ies_existing_customer_or_open_opportunity": "IES suppression",
    "known_accountants": "exclude accountants",
    "account_age_days": "account tenure",
    "geo_region": "US only",
    "product_line": "product family",
}


def get_conn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set. Add it to .env or export it.")
    return psycopg2.connect(url)


def parse_elm_from_key(key: str) -> tuple[str | None, str | None]:
    """Return (campaign_id, elm_id) from segment audience key."""
    if not key:
        return None, None
    m = ELM_KEY_RE.match(key)
    if m:
        num = m.group(1)
        return f"elm-{num}", f"ELM-{num}"
    return None, None


def extract_traits_from_criteria(criteria: str) -> list[str]:
    if not criteria:
        return []
    return list(dict.fromkeys(TRAIT_RE.findall(criteria)))


def infer_products_from_key(key: str, name: str) -> list[str]:
    text = f"{key} {name}".lower()
    products = []
    if "workforcehub" in text or "payroll" in text:
        products.append("WorkforceHub")
    if "growthcapital" in text or "capital" in text:
        products.append("GrowthCapital")
    if "ledgercore" in text or "lc_" in text or "lcp_" in text:
        products.append("LedgerCore")
    if "payflow" in text or "pf_" in text or "money" in text:
        products.append("PayFlow")
    if not products:
        products.append("LedgerCore")
    return anonymize_products(products)


def infer_goal_from_key(key: str, name: str) -> str | None:
    text = f"{key} {name}".lower()
    if any(w in text for w in ("retain", "retention", "save", "churn")):
        return "Retain"
    if any(w in text for w in ("upsell", "upgrade", "attach")):
        return "Upsell"
    if any(w in text for w in ("ftu", "onboard", "welcome")):
        return "Retain"
    if "attach" in text:
        return "Attach"
    return None


def split_sot_criteria(text: str) -> list[dict]:
    """Rule-based split of SOT audience prose into criterion rows."""
    if not text or not text.strip():
        return []
    # Split on sentence boundaries and commas for long prose
    parts = re.split(r"[.;]\s+|\n+", text.strip())
    rows = []
    for i, part in enumerate(parts):
        part = part.strip().strip(",")
        if len(part) < 4:
            continue
        lower = part.lower()
        ctype = "exclusion" if any(w in lower for w in ("exclude", "not ", "without", "suppress")) else "inclusion"
        keywords = [w for w in re.findall(r"[a-zA-Z]{3,}", lower) if w not in {"and", "the", "for", "with", "who", "are"}][:8]
        rows.append({
            "criterion_text": anonymize_text(part),
            "concept_keywords": keywords,
            "criterion_type": ctype,
            "sort_order": i,
        })
    return rows


def build_manifest_from_spec(campaign_id: str, elm_id: str | None, criteria: str, traits: list[str], size: int | None) -> dict:
    """Build ground-truth manifest JSON from a Segment audience spec."""
    criteria_rows = []
    for i, trait in enumerate(traits):
        anon_trait = anonymize_trait_key(trait)
        hint = TRAIT_NL_HINTS.get(anon_trait, anon_trait.replace("_", " "))
        criteria_rows.append({
            "criterion": hint,
            "trait": anon_trait,
            "operator": "RESOLVED",
            "value": None,
            "source": "segment_cdp",
            "status": "resolved",
            "sort_order": i,
        })
    return {
        "campaign_id": campaign_id,
        "elm_id": elm_id,
        "criteria": criteria_rows,
        "segment_expression": anonymize_criteria(criteria),
        "expected_size": size,
        "sibling_campaigns_used": [],
        "resolution_summary": {
            "resolved": len(traits),
            "unresolved": 0,
            "source": "segment_extract",
        },
    }


def load_jsonl(path: Path):
    if not path.exists():
        log.warning("Missing %s — skipping", path)
        return
    with path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def seed_log(cur, phase: str, count: int, notes: str = ""):
    cur.execute(
        """
        INSERT INTO neon_seed_log (phase, finished_at, records_count, notes)
        VALUES (%s, NOW(), %s, %s)
        """,
        (phase, count, notes),
    )


def truncate_all(cur):
    tables = [
        "audience_destinations",
        "ground_truth_manifests",
        "audience_criteria",
        "campaign_connections",
        "campaign_activation_windows",
        "nl_phrases",
        "attribute_mappings",
        "audience_specs",
        "segment_traits",
        "campaigns",
    ]
    for t in tables:
        cur.execute(f"TRUNCATE {t} CASCADE")
    log.info("Truncated all Neon audience tables")


def seed_attribute_mappings(cur, dry_run: bool) -> int:
    count = 0
    for m in ATTRIBUTE_MAPPINGS:
        if dry_run:
            count += 1 + len(m["nl_phrases"])
            continue
        cur.execute(
            """
            INSERT INTO attribute_mappings (id, spec_name, system_name, system, data_type, nl_operator, status, notes)
            VALUES (%(id)s, %(spec_name)s, %(system_name)s, %(system)s, %(data_type)s, %(nl_operator)s, %(status)s, %(notes)s)
            ON CONFLICT (id) DO UPDATE SET
                spec_name = EXCLUDED.spec_name,
                system_name = EXCLUDED.system_name,
                nl_operator = EXCLUDED.nl_operator,
                status = EXCLUDED.status,
                notes = EXCLUDED.notes
            """,
            m,
        )
        count += 1
        for phrase in m["nl_phrases"]:
            cur.execute(
                """
                INSERT INTO nl_phrases (mapping_id, phrase, validated_by_campaign_ids)
                VALUES (%s, %s, '{}')
                ON CONFLICT DO NOTHING
                """,
                (m["id"], phrase.lower()),
            )
            count += 1
    return count


def seed_segment_extract(cur, dry_run: bool) -> dict:
    audiences_path = SEG_DIR / "audiences.jsonl"
    traits_path = SEG_DIR / "traits.jsonl"
    dest_path = SEG_DIR / "destinations.jsonl"

    traits_by_aud: dict[str, list[str]] = defaultdict(list)
    trait_usage: Counter = Counter()
    for row in load_jsonl(traits_path):
        aid = row["audience_id"]
        tk = anonymize_trait_key(row["trait_key"])
        if not row.get("is_audience_ref"):
            traits_by_aud[aid].append(tk)
            trait_usage[tk] += 1

    campaigns: dict[str, dict] = {}
    specs: list[tuple] = []
    spec_id_by_aud: dict[str, str] = {}
    manifest_data: dict[str, dict] = defaultdict(lambda: {
        "traits": set(), "best_criteria": "", "best_size": None, "elm_id": None,
    })

    for aud in load_jsonl(audiences_path):
        aid = aud["audience_id"]
        key = anonymize_identifier(aud.get("key") or aud.get("name") or "")
        campaign_id, elm_id = parse_elm_from_key(key)

        if not campaign_id:
            slug = re.sub(r"[^a-z0-9]+", "-", key.lower())[:60].strip("-") or aid[-12:]
            campaign_id = f"audience-{slug}"
            elm_id = None

        spec_id = f"aspec-{aid}"
        spec_id_by_aud[aid] = spec_id
        criteria = anonymize_criteria(aud.get("criteria") or "")
        traits = anonymize_traits(traits_by_aud.get(aid) or extract_traits_from_criteria(criteria))
        size = aud.get("latest_size")
        audience_name = anonymize_identifier(aud.get("name") or key)

        if campaign_id not in campaigns:
            campaigns[campaign_id] = {
                "id": campaign_id,
                "elm_id": elm_id,
                "name": audience_name,
                "business_unit": "Acme SMB",
                "campaign_goal": infer_goal_from_key(key, audience_name),
                "products": infer_products_from_key(key, audience_name),
                "channels": ["email", "ipd"],
                "status": "built" if aud.get("status") == "Live" else "planning",
            }

        specs.append((
            spec_id, campaign_id, audience_name, aid, key, traits, criteria, size,
            "built" if aud.get("enabled") else "draft",
        ))

        md = manifest_data[campaign_id]
        md["traits"].update(traits)
        md["elm_id"] = md["elm_id"] or elm_id
        if len(criteria or "") > len(md["best_criteria"]):
            md["best_criteria"] = criteria
            md["best_size"] = size
        elif md["best_size"] is None:
            md["best_size"] = size

    if dry_run:
        return {
            "campaigns": len(campaigns),
            "specs": len(specs),
            "manifests": len(manifest_data),
            "destinations": 0,
            "traits": len(trait_usage),
        }

    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO campaigns (id, elm_id, name, business_unit, campaign_goal, products, channels, status, target_launch_date)
        VALUES (%(id)s, %(elm_id)s, %(name)s, %(business_unit)s, %(campaign_goal)s, %(products)s, %(channels)s, %(status)s, NULL)
        ON CONFLICT (id) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, campaigns.name),
            campaign_goal = COALESCE(EXCLUDED.campaign_goal, campaigns.campaign_goal),
            products = CASE WHEN cardinality(EXCLUDED.products) > 0 THEN EXCLUDED.products ELSE campaigns.products END,
            updated_at = NOW()
        """,
        list(campaigns.values()),
        page_size=500,
    )

    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO audience_specs (
            id, campaign_id, source, audience_name, segment_audience_id,
            segment_audience_key, attributes, audience_criteria, size_estimate, platform, status
        )
        VALUES (%s, %s, 'segment_cdp', %s, %s, %s, %s, %s, %s, 'segment_cdp', %s)
        ON CONFLICT (id) DO UPDATE SET
            attributes = EXCLUDED.attributes,
            audience_criteria = EXCLUDED.audience_criteria,
            size_estimate = EXCLUDED.size_estimate,
            status = EXCLUDED.status,
            updated_at = NOW()
        """,
        specs,
        page_size=500,
    )

    manifest_rows = []
    for campaign_id, md in manifest_data.items():
        all_traits = sorted(md["traits"])
        manifest = build_manifest_from_spec(
            campaign_id, md["elm_id"], md["best_criteria"], all_traits, md["best_size"],
        )
        manifest = anonymize_manifest_json(manifest)
        manifest_rows.append((
            campaign_id,
            psycopg2.extras.Json(manifest),
            anonymize_criteria(md["best_criteria"]),
            md["best_size"],
            psycopg2.extras.Json(manifest["resolution_summary"]),
        ))

    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO ground_truth_manifests (campaign_id, manifest_json, segment_expression, expected_size, resolution_summary)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (campaign_id) DO UPDATE SET
            manifest_json = EXCLUDED.manifest_json,
            segment_expression = EXCLUDED.segment_expression,
            expected_size = COALESCE(EXCLUDED.expected_size, ground_truth_manifests.expected_size),
            resolution_summary = EXCLUDED.resolution_summary,
            updated_at = NOW()
        """,
        manifest_rows,
        page_size=500,
    )

    dest_rows = []
    for dest in load_jsonl(dest_path):
        aid = dest.get("audience_id")
        spec_id = spec_id_by_aud.get(aid)
        if spec_id:
            dest_rows.append((
                spec_id,
                anonymize_text(dest.get("destination_name")),
                dest.get("destination_id"),
                anonymize_text(dest.get("destination_type")),
                dest.get("connection_enabled", True),
            ))

    if dest_rows:
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO audience_destinations (audience_spec_id, destination_name, destination_id, destination_type, connection_enabled)
            VALUES (%s, %s, %s, %s, %s)
            """,
            dest_rows,
            page_size=500,
        )

    trait_rows = [(anonymize_trait_key(k), v) for k, v in trait_usage.items()]
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO segment_traits (trait_key, usage_count)
        VALUES (%s, %s)
        ON CONFLICT (trait_key) DO UPDATE SET usage_count = EXCLUDED.usage_count
        """,
        trait_rows,
        page_size=500,
    )

    return {
        "campaigns": len(campaigns),
        "specs": len(specs),
        "manifests": len(manifest_rows),
        "destinations": len(dest_rows),
        "traits": len(trait_rows),
    }


def seed_neo4j_enrichment(cur, neo4j_uri: str, dry_run: bool) -> dict:
    try:
        from neo4j import GraphDatabase
    except ImportError:
        log.warning("neo4j package not installed — skipping Neo4j enrichment")
        return {}

    user = os.environ.get("NEO4J_USER", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD", "agenticmops")

    try:
        driver = GraphDatabase.driver(neo4j_uri, auth=(user, password))
        driver.verify_connectivity()
    except Exception as e:
        log.warning("Neo4j unavailable at %s: %s", neo4j_uri, e)
        return {}

    enriched = 0
    conn_count = 0
    criteria_added = 0

    with driver.session() as session:
        # Enrich campaigns from KG
        result = session.run(
            """
            MATCH (c:Campaign)
            RETURN c.id AS id, c.elmId AS elmId, c.name AS name,
                   c.businessUnit AS businessUnit, c.campaignGoal AS campaignGoal,
                   c.campaignType AS campaignType, c.products AS products,
                   c.channels AS channels, c.sotMainAudience AS sotMainAudience,
                   c.status AS status, c.targetLaunchDate AS targetLaunchDate
            """
        )
        for rec in result:
            cid = rec["id"]
            if dry_run:
                enriched += 1
                continue
            cur.execute(
                """
                INSERT INTO campaigns (id, elm_id, name, business_unit, campaign_goal, campaign_type, products, channels, sot_main_audience, status, target_launch_date)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    elm_id = COALESCE(EXCLUDED.elm_id, campaigns.elm_id),
                    name = COALESCE(EXCLUDED.name, campaigns.name),
                    business_unit = COALESCE(EXCLUDED.business_unit, campaigns.business_unit),
                    campaign_goal = COALESCE(EXCLUDED.campaign_goal, campaigns.campaign_goal),
                    campaign_type = COALESCE(EXCLUDED.campaign_type, campaigns.campaign_type),
                    products = CASE WHEN cardinality(EXCLUDED.products) > 0 THEN EXCLUDED.products ELSE campaigns.products END,
                    channels = CASE WHEN cardinality(EXCLUDED.channels) > 0 THEN EXCLUDED.channels ELSE campaigns.channels END,
                    sot_main_audience = COALESCE(EXCLUDED.sot_main_audience, campaigns.sot_main_audience),
                    status = COALESCE(EXCLUDED.status, campaigns.status),
                    updated_at = NOW()
                """,
                (
                    cid,
                    rec["elmId"],
                    rec["name"],
                    rec["businessUnit"],
                    rec["campaignGoal"],
                    rec["campaignType"],
                    rec["products"] or [],
                    rec["channels"] or [],
                    rec["sotMainAudience"],
                    rec["status"],
                    rec["targetLaunchDate"],
                ),
            )
            enriched += 1

            if rec["sotMainAudience"]:
                for row in split_sot_criteria(rec["sotMainAudience"]):
                    cur.execute(
                        """
                        INSERT INTO audience_criteria (campaign_id, criterion_text, concept_keywords, criterion_type, sort_order)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT DO NOTHING
                        """,
                        (cid, row["criterion_text"], row["concept_keywords"], row["criterion_type"], row["sort_order"]),
                    )
                    criteria_added += 1

        # Graph edges
        edge_queries = [
            ("depends_on", "MATCH (child:Campaign)-[:DEPENDS_ON]->(parent:Campaign) RETURN child.id AS from_id, parent.id AS to_id, 'depends_on' AS type"),
            ("shares_audience", "MATCH (c1:Campaign)-[:SHARES_AUDIENCE]->(c2:Campaign) RETURN c1.id AS from_id, c2.id AS to_id, 'shares_audience' AS type"),
            ("shares_experiment", "MATCH (c1:Campaign)-[:SHARES_EXPERIMENT]->(c2:Campaign) RETURN c1.id AS from_id, c2.id AS to_id, 'shares_experiment' AS type"),
            ("experiments_against", "MATCH (c:Campaign)-[:EXPERIMENTS_AGAINST]->(e:Campaign) RETURN c.id AS from_id, e.id AS to_id, 'experiments_against' AS type"),
        ]
        for _, cypher in edge_queries:
            for rec in session.run(cypher):
                if dry_run:
                    conn_count += 1
                    continue
                try:
                    cur.execute(
                        """
                        INSERT INTO campaign_connections (from_campaign_id, to_campaign_id, connection_type)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (from_campaign_id, to_campaign_id, connection_type) DO NOTHING
                        """,
                        (rec["from_id"], rec["to_id"], rec["type"]),
                    )
                    conn_count += 1
                except psycopg2.Error:
                    pass

    driver.close()
    return {"campaigns_enriched": enriched, "connections": conn_count, "criteria_rows": criteria_added}


def derive_shares_audience(cur, dry_run: bool) -> int:
    """Connect campaigns with identical Segment criteria (shares_audience)."""
    cur.execute(
        """
        SELECT campaign_id, audience_criteria
        FROM audience_specs
        WHERE audience_criteria IS NOT NULL AND length(audience_criteria) > 20
          AND source = 'segment_cdp'
        """
    )
    by_hash: dict[str, list[str]] = defaultdict(list)
    for campaign_id, criteria in cur.fetchall():
        h = hashlib.md5(criteria.encode()).hexdigest()
        by_hash[h].append(campaign_id)

    added = 0
    for ids in by_hash.values():
        if len(ids) < 2:
            continue
        ids = sorted(set(ids))
        for i, c1 in enumerate(ids):
            for c2 in ids[i + 1 :]:
                if not dry_run:
                    try:
                        cur.execute(
                            """
                            INSERT INTO campaign_connections (from_campaign_id, to_campaign_id, connection_type, metadata)
                            VALUES (%s, %s, 'shares_audience', '{"derived": true}')
                            ON CONFLICT (from_campaign_id, to_campaign_id, connection_type) DO NOTHING
                            """,
                            (c1, c2),
                        )
                    except psycopg2.Error:
                        pass
                added += 1
    return added


def enrich_manifests_from_eval(cur, dry_run: bool) -> int:
    """Merge eval JSON recall metadata into ground_truth_manifests."""
    eval_path = OUTPUT_DIR / "audience_criteria_eval.json"
    if not eval_path.exists():
        log.warning("No audience_criteria_eval.json — skipping eval enrichment")
        return 0

    data = json.loads(eval_path.read_text())
    count = 0
    for camp in data.get("campaigns", []):
        cid = camp.get("id") or camp.get("elmId", "").lower().replace("elm-", "elm-")
        if not cid:
            continue
        if not cid.startswith("elm-"):
            cid = f"elm-{cid.replace('ELM-', '').replace('elm-', '')}"

        summary = {
            "eval_full_recall": camp.get("fullRecall"),
            "eval_attr_recall": camp.get("attrRecall"),
            "eval_sibling_count": camp.get("siblingCount"),
            "missed_clauses": [anonymize_text(c) for c in camp.get("missedClauses", [])[:20]],
        }
        if dry_run:
            count += 1
            continue
        cur.execute(
            """
            UPDATE ground_truth_manifests
            SET resolution_summary = resolution_summary || %s::jsonb,
                updated_at = NOW()
            WHERE campaign_id = %s
            """,
            (json.dumps(summary), cid),
        )
        if cur.rowcount:
            count += 1
    return count


def validate_nl_phrase_matches(cur, dry_run: bool) -> int:
    """Mark nl_phrases validated when campaign SOT text contains the phrase."""
    if dry_run:
        return 0
    cur.execute(
        """
        UPDATE nl_phrases np
        SET validated_by_campaign_ids = sub.ids
        FROM (
            SELECT np2.id AS phrase_id,
                   array_agg(DISTINCT c.id) AS ids
            FROM nl_phrases np2
            JOIN campaigns c ON c.sot_main_audience IS NOT NULL
                AND lower(c.sot_main_audience) LIKE '%' || np2.phrase || '%'
            GROUP BY np2.id
        ) sub
        WHERE np.id = sub.phrase_id
        """
    )
    return cur.rowcount


def seed_activation_windows(cur, dry_run: bool, limit: int = 60) -> int:
    """Assign synthetic activation windows for collision-agent date filtering."""
    cur.execute(
        """
        SELECT id FROM campaigns
        WHERE status IN ('built', 'planning')
        ORDER BY id
        LIMIT %s
        """,
        (limit,),
    )
    campaign_ids = [row[0] for row in cur.fetchall()]
    if not campaign_ids:
        return 0

    today = date.today()
    rows = []
    for cid in campaign_ids:
        h = int(hashlib.md5(cid.encode()).hexdigest(), 16)
        start_offset = h % 22
        duration = 3 + (h % 12)
        start = today + timedelta(days=start_offset)
        end = start + timedelta(days=duration)
        rows.append((cid, start, end))

    if dry_run:
        return len(rows)

    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO campaign_activation_windows (campaign_id, activation_start, activation_end)
        VALUES (%s, %s, %s)
        ON CONFLICT (campaign_id) DO UPDATE SET
            activation_start = EXCLUDED.activation_start,
            activation_end = EXCLUDED.activation_end
        """,
        rows,
        page_size=200,
    )
    return len(rows)


def validate_anonymization_in_db(cur) -> None:
    """Raise if forbidden tokens remain in demo-visible columns."""
    issues: list[str] = []

    cur.execute(
        "SELECT id, name, products, business_unit, sot_main_audience FROM campaigns"
    )
    for cid, name, products, bu, sot in cur.fetchall():
        blob = " ".join(filter(None, [name, bu, sot, " ".join(products or [])]))
        bad = contains_forbidden(blob)
        if bad:
            issues.append(f"campaign {cid}: {bad}")

    cur.execute(
        """
        SELECT campaign_id, audience_name, audience_criteria, attributes
        FROM audience_specs
        """
    )
    for cid, aname, criteria, attrs in cur.fetchall():
        blob = " ".join(filter(None, [aname, criteria, " ".join(attrs or [])]))
        bad = contains_forbidden(blob)
        if bad:
            issues.append(f"audience_spec {cid}: {bad}")

    cur.execute(
        "SELECT campaign_id, segment_expression FROM ground_truth_manifests"
    )
    for cid, expr in cur.fetchall():
        bad = contains_forbidden(expr or "")
        if bad:
            issues.append(f"manifest {cid}: {bad}")

    cur.execute("SELECT phrase FROM nl_phrases")
    for (phrase,) in cur.fetchall():
        bad = contains_forbidden(phrase or "")
        if bad:
            issues.append(f"nl_phrase '{phrase}': {bad}")

    if issues:
        sample = issues[:15]
        raise SystemExit(
            f"Anonymization validation failed ({len(issues)} issues). Sample: {sample}"
        )
    log.info("Anonymization validation passed")


def main():
    parser = argparse.ArgumentParser(description="Seed Neon with Audience Agent data")
    parser.add_argument("--dry-run", action="store_true", help="Count records without writing")
    parser.add_argument("--truncate", action="store_true", help="Clear tables before seeding")
    parser.add_argument("--skip-neo4j", action="store_true", help="Skip Neo4j enrichment")
    parser.add_argument("--neo4j-uri", default=os.environ.get("NEO4J_URI", "bolt://localhost:7688"))
    parser.add_argument("--skip-derived-connections", action="store_true")
    parser.add_argument(
        "--validate-anonymization",
        action="store_true",
        help="After seed, assert no forbidden product/customer tokens in DB",
    )
    args = parser.parse_args()

    if args.dry_run:
        n = sum(1 + len(m["nl_phrases"]) for m in ATTRIBUTE_MAPPINGS)
        aud_count = sum(1 for _ in load_jsonl(SEG_DIR / "audiences.jsonl"))
        log.info("Dry run — attribute mappings: %d rows", n)
        log.info("Dry run — segment audiences: %d", aud_count)
        log.info("Dry run complete — no database connection required")
        return

    conn = get_conn()
    conn.autocommit = False
    cur = conn.cursor()

    try:
        if args.truncate:
            truncate_all(cur)

        n = seed_attribute_mappings(cur, False)
        log.info("Attribute mappings + nl phrases: %d rows", n)
        seed_log(cur, "attribute_mappings", n)

        seg = seed_segment_extract(cur, False)
        log.info("Segment extract: %s", seg)
        seed_log(cur, "segment_extract", seg["specs"], json.dumps(seg))

        if not args.skip_neo4j:
            neo = seed_neo4j_enrichment(cur, args.neo4j_uri, False)
            log.info("Neo4j enrichment: %s", neo)
            if neo:
                seed_log(cur, "neo4j_enrichment", neo.get("connections", 0), json.dumps(neo))

        if not args.skip_derived_connections:
            derived = derive_shares_audience(cur, False)
            log.info("Derived shares_audience connections: %d", derived)

        eval_n = enrich_manifests_from_eval(cur, False)
        log.info("Eval-enriched manifests: %d", eval_n)

        validated = validate_nl_phrase_matches(cur, False)
        log.info("NL phrase validations updated: %d", validated)

        windows = seed_activation_windows(cur, False)
        log.info("Activation windows seeded: %d", windows)
        if windows:
            seed_log(cur, "activation_windows", windows)

        if args.validate_anonymization:
            validate_anonymization_in_db(cur)

        conn.commit()
        log.info("Seed committed successfully")

        cur.execute("SELECT count(*) FROM campaigns")
        log.info("  campaigns: %s", cur.fetchone()[0])
        cur.execute("SELECT count(*) FROM audience_specs")
        log.info("  audience_specs: %s", cur.fetchone()[0])
        cur.execute("SELECT count(*) FROM ground_truth_manifests")
        log.info("  ground_truth_manifests: %s", cur.fetchone()[0])
        cur.execute("SELECT count(*) FROM campaign_connections")
        log.info("  campaign_connections: %s", cur.fetchone()[0])
        cur.execute("SELECT count(*) FROM nl_phrases")
        log.info("  nl_phrases: %s", cur.fetchone()[0])

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
