#!/usr/bin/env python3
"""Regenerate sitemap.xml from indexable HTML pages (skips noindex)."""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://www.revforgehq.com"
NOINDEX = re.compile(r'<meta\s+name=["\']robots["\']\s+content=["\'][^"\']*noindex', re.I)


def path_to_url(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    if rel == "index.html":
        return f"{SITE}/"
    if rel.endswith("/index.html"):
        return f"{SITE}/{rel[:-len('index.html')]}"
    return f"{SITE}/{rel}"


def is_indexable(html_path: Path) -> bool:
    text = html_path.read_text(encoding="utf-8", errors="ignore")
    if NOINDEX.search(text):
        return False
    # Skip root-level standalone files that are not primary site pages
    rel = html_path.relative_to(ROOT)
    if len(rel.parts) == 1 and rel.name not in {"index.html"}:
        return False
    return True


def collect_urls() -> list[str]:
    urls: list[str] = []
    for path in sorted(ROOT.rglob("index.html")):
        parts = path.relative_to(ROOT).parts
        if parts[0] in {"functions", "scripts", "node_modules", ".git"}:
            continue
        if not is_indexable(path):
            continue
        urls.append(path_to_url(path))
    return sorted(set(urls), key=lambda u: (u != f"{SITE}/", u))


def main() -> None:
    urls = collect_urls()
    today = date.today().isoformat()
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for url in urls:
        lines.extend(
            [
                "  <url>",
                f"    <loc>{url}</loc>",
                f"    <lastmod>{today}</lastmod>",
                "  </url>",
            ]
        )
    lines.append("</urlset>")
    out = ROOT / "sitemap.xml"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(urls)} URLs to {out}")


if __name__ == "__main__":
    main()
