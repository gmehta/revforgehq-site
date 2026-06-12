#!/usr/bin/env python3
"""Build /{slug}/ from {slug}-executive-report.html — no scan gate."""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "wiz" / "index.html"
_SCAN_LOCAL = ROOT / "revforge-scan"
_SCAN_HQ = ROOT.parent / "RevForgeHQ" / "revforge-scan"
_SCAN_LEGACY = ROOT.parent / "Revforgehq" / "revforge-scan"

STYLE_REPLACEMENTS = [
    ("var(--good)", "var(--scan-good)"),
    ("var(--bad)", "var(--scan-bad)"),
    ("var(--warn)", "var(--scan-warn)"),
    ("var(--mut)", "var(--text-muted)"),
    ("var(--txt)", "var(--text)"),
    ("var(--blue)", "var(--scan-blue)"),
    ("var(--purp)", "var(--scan-purple)"),
    ("var(--acc)", "var(--accent-warm)"),
    ("var(--acc2)", "var(--accent-warm)"),
    ("var(--panel)", "var(--bg-card)"),
    ("var(--panel2)", "var(--bg-elevated)"),
    ("var(--line)", "var(--border)"),
    ("var(--bg)", "transparent"),
]

META = {
    "fabletics": {
        "title": "Fabletics AI Visibility Executive Report · RevForgeHQ",
        "description": (
            "RevForge executive AI visibility report for Fabletics — measured answers, "
            "membership pricing errors, citation landscape, and prompt explorer."
        ),
    },
    "bill": {
        "title": "BILL AI Visibility Executive Report · RevForgeHQ",
        "description": (
            "RevForge executive AI visibility report for BILL — measured answers, "
            "AP/AR buyer prompts, citation landscape, and prompt explorer."
        ),
    },
}


def resolve_exec_report(slug: str) -> Path:
    name = f"{slug}-executive-report.html"
    candidates = [
        _SCAN_LOCAL / "results" / slug / name,
        _SCAN_HQ / "results" / slug / name,
        _SCAN_LEGACY / "results" / slug / name,
    ]
    existing = [p for p in candidates if p.is_file()]
    if not existing:
        raise SystemExit(f"{name} not found for slug {slug!r}")
    return max(existing, key=lambda p: p.stat().st_mtime)


def load_template_parts() -> tuple[str, str, str, str]:
    text = TEMPLATE.read_text()
    head_end = text.index("</head>") + len("</head>")
    nav_start = text.index('<nav id="nav"')
    main_start = text.index('<main class="container">')
    footer_start = text.index('<footer class="footer">')
    head = text[:head_end]
    nav = text[nav_start:main_start]
    footer = text[footer_start:]
    head = re.sub(r"\s*<link rel=\"stylesheet\" href=\"/assets/scan-gate.css\" />\n", "\n", head)
    footer = re.sub(r"\s*<script src=\"/assets/scan-gate.js\"></script>\n", "\n", footer)
    style_start = head.index("<style>")
    style_end = head.index("</style>") + len("</style>")
    base_styles = head[style_start:style_end]
    head = head[:style_start] + head[style_end:]
    return head, nav, footer, base_styles


def adapt_exec_style(css: str, scope_class: str) -> str:
    out = css.replace(":root", f".{scope_class}")
    out = re.sub(r"(?<![-\w])body\{[^}]+\}", "", out)
    for old, new in STYLE_REPLACEMENTS:
        out = out.replace(old, new)
    return out


def extract_executive(path: Path) -> tuple[str, str, str]:
    raw = path.read_text()
    style_m = re.search(r"<style>(.*?)</style>", raw, re.S)
    wrap_m = re.search(r'<div class="wrap">(.*)</div>\s*<script>', raw, re.S)
    script_m = re.search(r"<script>(.*?)</script>", raw, re.S)
    if not style_m or not wrap_m or not script_m:
        raise ValueError(f"Could not parse executive report: {path}")
    return style_m.group(1), wrap_m.group(1).strip(), script_m.group(1)


def extra_styles(scope_class: str) -> str:
    return f"""
    .{scope_class} {{ font-size: 15px; line-height: 1.6; color: var(--text-muted); }}
    .{scope_class} h1 {{
      font-family: var(--font-serif);
      font-size: clamp(26px, 4vw, 34px);
      font-weight: 400;
      color: var(--text);
      margin: 18px 0 4px;
    }}
    .{scope_class} h2 {{
      font-family: var(--font-serif);
      font-size: 22px;
      font-weight: 400;
      color: var(--text);
      margin: 44px 0 12px;
    }}
    .{scope_class} .sub b, .{scope_class} p b, .{scope_class} td b {{ color: var(--text); }}
    .{scope_class} .logo {{ font-weight: 700; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--accent-warm); }}
    .{scope_class} .logo span {{ color: var(--text); }}
    .{scope_class} .badge {{
      font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
      color: var(--scan-good); background: var(--scan-good-dim);
      border: 1px solid rgba(107, 158, 120, 0.3); border-radius: 999px; padding: 5px 12px;
    }}
    .{scope_class} .hdr {{ display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px; margin-bottom: 8px; }}
    .{scope_class} .foot {{ color: var(--text-dim); font-size: 12px; margin-top: 40px; border-top: 1px solid var(--border); padding-top: 18px; }}
    .{scope_class} a {{ color: var(--accent-warm); }}
    .{scope_class} .prow-body {{ display: none; }}
    """


def build(slug: str) -> Path:
    exec_report = resolve_exec_report(slug)
    out = ROOT / slug / "index.html"
    scope_class = f"{slug}-exec"
    meta = META.get(slug, {
        "title": f"{slug.title()} AI Visibility Executive Report · RevForgeHQ",
        "description": f"RevForge executive AI visibility report for {slug}.",
    })

    exec_style, exec_body, exec_script = extract_executive(exec_report)
    head, nav, footer, base_styles = load_template_parts()

    head = re.sub(r"<title>.*?</title>", f"<title>{meta['title']}</title>", head, count=1)
    head = re.sub(
        r'<meta name="description" content="[^"]*"',
        f'<meta name="description" content="{meta["description"]}"',
        head,
        count=1,
    )

    page = (
        head
        + "\n"
        + base_styles
        + "\n  <style>\n"
        + extra_styles(scope_class)
        + "\n"
        + adapt_exec_style(exec_style, scope_class)
        + "\n  </style>\n"
        + '  <script src="/analytics.js"></script>\n</head>\n<body class="page-inner optavia-page">\n\n'
        + nav
        + f'\n  <main class="container {scope_class}">\n'
        + exec_body
        + "\n  </main>\n\n  "
        + footer.replace(
            '  <script src="/script.js"></script>',
            f"  <script>\n{exec_script}\n  </script>\n  <script src=\"/script.js\"></script>",
        )
        + "\n</body>\n</html>"
    )

    out.parent.mkdir(exist_ok=True)
    out.write_text(page)
    return out, exec_report


def main() -> None:
    parser = argparse.ArgumentParser(description="Build executive report site page")
    parser.add_argument("slug", help="Company slug, e.g. bill or fabletics")
    args = parser.parse_args()
    out, src = build(args.slug)
    print(f"✓ {args.slug} executive → {out.relative_to(ROOT)} (from {src})")


if __name__ == "__main__":
    main()
