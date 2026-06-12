#!/usr/bin/env python3
"""Build /fabletics/ from fabletics-executive-report.html — no scan gate."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "wiz" / "index.html"
_SCAN_LOCAL = ROOT / "revforge-scan"
_SCAN_HQ = ROOT.parent / "RevForgeHQ" / "revforge-scan"
_SCAN_LEGACY = ROOT.parent / "Revforgehq" / "revforge-scan"


def resolve_exec_report() -> Path:
    candidates = [
        _SCAN_LOCAL / "results" / "fabletics" / "fabletics-executive-report.html",
        _SCAN_HQ / "results" / "fabletics" / "fabletics-executive-report.html",
        _SCAN_LEGACY / "results" / "fabletics" / "fabletics-executive-report.html",
    ]
    existing = [p for p in candidates if p.is_file()]
    if not existing:
        raise SystemExit("fabletics-executive-report.html not found in revforge-scan results")
    return max(existing, key=lambda p: p.stat().st_mtime)


EXEC_REPORT = resolve_exec_report()
OUT = ROOT / "fabletics" / "index.html"

STYLE_REPLACEMENTS = [
    (":root", ".fabletics-exec"),
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


def load_template_parts() -> tuple[str, str, str]:
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


def adapt_exec_style(css: str) -> str:
    out = css
    out = re.sub(r"body\{[^}]+\}", "", out)
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


def build() -> Path:
    if not EXEC_REPORT.is_file():
        raise SystemExit(f"Executive report not found: {EXEC_REPORT}")

    exec_style, exec_body, exec_script = extract_executive(EXEC_REPORT)
    head, nav, footer, base_styles = load_template_parts()

    head = re.sub(
        r"<title>.*?</title>",
        "<title>Fabletics AI Visibility Executive Report · RevForgeHQ</title>",
        head,
        count=1,
    )
    head = re.sub(
        r'<meta name="description" content="[^"]*"',
        '<meta name="description" content="RevForge executive AI visibility report for Fabletics — '
        '101 measured answers, membership pricing errors, citation landscape, and prompt explorer."',
        head,
        count=1,
    )

    exec_css = adapt_exec_style(exec_style)
    extra_styles = """
    .fabletics-exec { font-size: 15px; line-height: 1.6; color: var(--text-muted); }
    .fabletics-exec h1 {
      font-family: var(--font-serif);
      font-size: clamp(26px, 4vw, 34px);
      font-weight: 400;
      color: var(--text);
      margin: 18px 0 4px;
    }
    .fabletics-exec h2 {
      font-family: var(--font-serif);
      font-size: 22px;
      font-weight: 400;
      color: var(--text);
      margin: 44px 0 12px;
    }
    .fabletics-exec .sub b, .fabletics-exec p b, .fabletics-exec td b { color: var(--text); }
    .fabletics-exec .logo { font-weight: 700; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--accent-warm); }
    .fabletics-exec .logo span { color: var(--text); }
    .fabletics-exec .badge {
      font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
      color: var(--scan-good); background: var(--scan-good-dim);
      border: 1px solid rgba(107, 158, 120, 0.3); border-radius: 999px; padding: 5px 12px;
    }
    .fabletics-exec .hdr { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px; margin-bottom: 8px; }
    .fabletics-exec .foot { color: var(--text-dim); font-size: 12px; margin-top: 40px; border-top: 1px solid var(--border); padding-top: 18px; }
    .fabletics-exec a { color: var(--accent-warm); }
    """

    page = (
        head
        + "\n"
        + base_styles
        + "\n  <style>\n"
        + extra_styles
        + "\n"
        + exec_css
        + "\n  </style>\n"
        + '  <script src="/analytics.js"></script>\n</head>\n<body class="page-inner optavia-page">\n\n'
        + nav
        + '\n  <main class="container fabletics-exec">\n'
        + exec_body
        + "\n  </main>\n\n  "
        + footer.replace(
            '  <script src="/script.js"></script>',
            f"  <script>\n{exec_script}\n  </script>\n  <script src=\"/script.js\"></script>",
        )
        + "\n</body>\n</html>"
    )

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(page)
    return OUT


if __name__ == "__main__":
    path = build()
    print(f"✓ fabletics executive → {path.relative_to(ROOT)} (from {EXEC_REPORT})")
