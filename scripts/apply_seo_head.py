#!/usr/bin/env python3
"""Inject canonical, Open Graph, and Twitter meta tags into key pages."""

from __future__ import annotations

import json
import re
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = Path(__file__).with_name("seo-pages.json")
MARKER_START = "<!-- seo:aeo -->"
MARKER_END = "<!-- /seo:aeo -->"


def build_block(page: dict, og_image: str) -> str:
    title = escape(page["title"], quote=True)
    desc = escape(page["description"], quote=True)
    url = escape(page["canonical"], quote=True)
    img = escape(og_image, quote=True)
    return f"""{MARKER_START}
  <link rel="canonical" href="{page['canonical']}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="RevForgeHQ" />
  <meta property="og:url" content="{page['canonical']}" />
  <meta property="og:title" content="{page['title']}" />
  <meta property="og:description" content="{page['description']}" />
  <meta property="og:image" content="{og_image}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{page['title']}" />
  <meta name="twitter:description" content="{page['description']}" />
  <meta name="twitter:image" content="{og_image}" />
{MARKER_END}"""


def head_section(text: str) -> tuple[str, int, int]:
    start = text.lower().find("<head")
    if start == -1:
        raise ValueError("No <head> element")
    head_open_end = text.find(">", start)
    end = text.lower().find("</head>", head_open_end)
    if head_open_end == -1 or end == -1:
        raise ValueError("Malformed <head>")
    return text, head_open_end + 1, end


def inject(path: Path, block: str) -> None:
    text = path.read_text(encoding="utf-8")
    text, head_start, head_end = head_section(text)
    head = text[head_start:head_end]
    pattern = re.compile(
        rf"{re.escape(MARKER_START)}.*?{re.escape(MARKER_END)}\s*",
        re.DOTALL,
    )
    if pattern.search(head):
        head = pattern.sub(block + "\n", head, count=1)
    else:
        needle = '<meta name="description" content="'
        rel = head.find(needle)
        if rel == -1:
            raise ValueError(f"No meta description in <head> of {path}")
        end = head.find("/>", rel)
        if end == -1:
            raise ValueError(f"Malformed meta description in {path}")
        insert_at = end + 2
        head = head[:insert_at] + "\n" + block + head[insert_at:]
    # Remove any legacy markers accidentally injected outside <head>.
    body = pattern.sub("", text[head_end:])
    text = text[:head_start] + head + body
    path.write_text(text, encoding="utf-8")


def main() -> None:
    data = json.loads(CONFIG.read_text(encoding="utf-8"))
    og_image = data["ogImage"]
    for page in data["pages"]:
        path = ROOT / page["file"]
        block = build_block(page, og_image)
        inject(path, block)
        print(f"Updated SEO head: {page['file']}")


if __name__ == "__main__":
    main()
