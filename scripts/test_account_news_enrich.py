#!/usr/bin/env python3
"""Smoke test: fetch recent news and write matches to accounts.news_events."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote_plus

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".dev.vars")
load_dotenv(ROOT / ".env")

log = logging.getLogger("test_account_news")

INDUSTRY_QUERIES = [
    "martech OR adtech OR salestech OR revops when:1d",
    "marketing automation OR customer data platform OR CDP when:1d",
    "CMO OR chief marketing officer OR revenue operations when:1d",
]

MAX_ARTICLES = 60
MAX_EVENTS_PER_ACCOUNT = 25


def require_database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise SystemExit("DATABASE_URL not set")
    return url


def parse_rss(xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)
    articles: list[dict] = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()
        source = (item.findtext("source") or "").strip() or None
        if not title or not link:
            continue
        published_at = None
        if pub_date:
            try:
                published_at = datetime.strptime(
                    pub_date, "%a, %d %b %Y %H:%M:%S %Z"
                ).replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                published_at = None
        articles.append(
            {
                "headline": title,
                "url": link,
                "source": source,
                "published_at": published_at,
            }
        )
    return articles


def fetch_google_news(query: str) -> list[dict]:
    url = (
        "https://news.google.com/rss/search?"
        f"q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en"
    )
    response = requests.get(url, headers={"User-Agent": "RevForgeHQ-NewsAgent/1.0"}, timeout=30)
    response.raise_for_status()
    return parse_rss(response.text)


def fetch_newsapi(api_key: str, hours: int = 24) -> list[dict]:
    from_date = (datetime.now(timezone.utc) - timedelta(hours=hours)).date().isoformat()
    params = {
        "q": '("martech" OR "adtech" OR "salestech" OR "revops" OR "marketing automation" OR "customer data platform")',
        "from": from_date,
        "sortBy": "publishedAt",
        "language": "en",
        "pageSize": 100,
        "apiKey": api_key,
    }
    response = requests.get("https://newsapi.org/v2/everything", params=params, timeout=30)
    response.raise_for_status()
    payload = response.json()
    return [
        {
            "headline": item["title"].strip(),
            "url": item["url"].strip(),
            "source": (item.get("source") or {}).get("name"),
            "published_at": item.get("publishedAt"),
        }
        for item in payload.get("articles", [])
        if item.get("title") and item.get("url")
    ]


def fetch_articles() -> tuple[list[dict], list[str]]:
    errors: list[str] = []
    batches: list[list[dict]] = []

    api_key = os.getenv("NEWS_API_KEY", "").strip()
    if api_key:
        try:
            batches.append(fetch_newsapi(api_key))
            log.info("NewsAPI returned %d articles", len(batches[-1]))
        except Exception as exc:
            errors.append(f"NewsAPI: {exc}")

    for query in INDUSTRY_QUERIES:
        try:
            articles = fetch_google_news(query)
            batches.append(articles)
            log.info("Google RSS (%s...) returned %d articles", query[:30], len(articles))
        except Exception as exc:
            errors.append(f"Google RSS ({query}): {exc}")

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    seen: set[str] = set()
    merged: list[dict] = []
    for article in [a for batch in batches for a in batch]:
        key = article["url"].lower()
        if key in seen:
            continue
        seen.add(key)
        published_at = article.get("published_at")
        if published_at:
            try:
                ts = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
                if ts < cutoff:
                    continue
            except ValueError:
                pass
        merged.append(article)

    return merged[:MAX_ARTICLES], errors


def event_id(url: str) -> str:
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
    return f"news_{digest}"


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def match_accounts(articles: list[dict], accounts: list[dict]) -> dict[str, list[dict]]:
    matches: dict[str, list[dict]] = {}
    fetched_at = datetime.now(timezone.utc).isoformat()

    for account in accounts:
        company = account["company_name"]
        norm = normalize_name(company)
        if len(norm) < 4:
            continue
        for article in articles:
            headline = article["headline"].lower()
            if norm in headline or (account.get("domain") and account["domain"].split(".")[0].lower() in headline):
                event = {
                    "id": event_id(article["url"]),
                    "headline": article["headline"],
                    "url": article["url"],
                    "source": article.get("source"),
                    "published_at": article.get("published_at"),
                    "summary": f"Recent news mentions {company}.",
                    "relevance_reason": "Company name matched in headline (smoke test matcher).",
                    "relevance_score": 0.7,
                    "fetched_at": fetched_at,
                }
                matches.setdefault(account["id"], []).append(event)
    return matches


def merge_events(existing: list[dict], incoming: list[dict]) -> list[dict]:
    by_url = {item["url"].lower(): item for item in [*existing, *incoming]}
    return sorted(
        by_url.values(),
        key=lambda item: item.get("published_at") or item.get("fetched_at") or "",
        reverse=True,
    )[:MAX_EVENTS_PER_ACCOUNT]


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    articles, errors = fetch_articles()
    log.info("Using %d unique recent articles", len(articles))
    if not articles:
        print(json.dumps({"ok": False, "error": "No articles fetched", "errors": errors}, indent=2))
        return 1

    conn = psycopg2.connect(require_database_url())
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, company_name, domain, news_events
                FROM accounts
                ORDER BY tier ASC NULLS LAST, company_name ASC
                """
            )
            accounts = cur.fetchall()

        matches = match_accounts(articles, accounts)
        accounts_enriched = 0
        events_added = 0

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            for account_id, events in matches.items():
                cur.execute(
                    "SELECT news_events FROM accounts WHERE id = %s",
                    (account_id,),
                )
                row = cur.fetchone()
                existing = row["news_events"] if row and row["news_events"] else []
                before = len(existing)
                merged = merge_events(existing, events)
                added = len(merged) - before
                if added <= 0:
                    continue
                cur.execute(
                    """
                    UPDATE accounts
                    SET news_events = %s::jsonb, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (json.dumps(merged), account_id),
                )
                accounts_enriched += 1
                events_added += added

            cur.execute(
                """
                INSERT INTO account_news_runs (
                  finished_at, articles_fetched, accounts_enriched, events_added, errors
                ) VALUES (NOW(), %s, %s, %s, %s::jsonb)
                """,
                (
                    len(articles),
                    accounts_enriched,
                    events_added,
                    json.dumps(errors) if errors else None,
                ),
            )
        conn.commit()

        sample = []
        if matches:
            first_id = next(iter(matches))
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT company_name, news_events FROM accounts WHERE id = %s",
                    (first_id,),
                )
                row = cur.fetchone()
                if row:
                    sample.append(
                        {
                            "company_name": row["company_name"],
                            "latest_event": (row["news_events"] or [])[0],
                        }
                    )

        result = {
            "ok": True,
            "articlesFetched": len(articles),
            "accountsEnriched": accounts_enriched,
            "eventsAdded": events_added,
            "errors": errors,
            "sample": sample,
        }
        print(json.dumps(result, indent=2))
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
