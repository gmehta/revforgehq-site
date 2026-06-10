#!/usr/bin/env python3
"""Generate RevForge site AI visibility scan pages from revforge-scan results."""
from __future__ import annotations

import html
import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "optavia" / "index.html"
SCAN_ROOT = Path(__file__).resolve().parents[2] / "Revforgehq" / "revforge-scan"
RESULTS = SCAN_ROOT / "results"
COMPANIES = SCAN_ROOT / "companies"

NOISE_DOMAINS = {"vertexaisearch.cloud.google.com"}

ENGINE_LABELS = {
    "openai": "OpenAI (GPT + web search)",
    "perplexity": "Perplexity",
    "aioverview": "Google AI Overviews",
    "gemini": "Gemini",
}

STAGE_ICONS = {
    "discover": "🔍 DISCOVER",
    "compare": "⚖️ COMPARE",
    "validate": "✅ VALIDATE",
}

SECTION_ORDER = [
    ("citation", 3, "Source landscape", "b"),
    ("sentinel", 4, "Risk findings", "r"),
    ("tech", 5, "Crawled Jun 10", "g"),
    ("strategic", 6, None, None),
    ("fix", 7, None, None),
]

VAR_REPLACEMENTS = [
    ("var(--good)", "var(--scan-good)"),
    ("var(--bad)", "var(--scan-bad)"),
    ("var(--warn)", "var(--scan-warn)"),
    ("var(--mut)", "var(--text-muted)"),
    ("var(--txt)", "var(--text)"),
    ("var(--blue)", "var(--scan-blue)"),
    ("var(--purp)", "var(--scan-purple)"),
    ("var(--acc)", "var(--accent-warm)"),
]


def pct(m: int, n: int) -> float:
    return round(100 * m / n, 1) if n else 0.0


def color_for(p: float) -> str:
    if p < 25:
        return "var(--scan-bad)"
    if p < 60:
        return "var(--scan-warn)"
    return "var(--scan-good)"


def inject_gate_assets(head: str, footer: str) -> tuple[str, str]:
    if "/assets/scan-gate.css" not in head:
        head = head.replace(
            '  <script src="/analytics.js"></script>',
            '  <link rel="stylesheet" href="/assets/scan-gate.css" />\n'
            '  <script src="/analytics.js"></script>',
        )
    if "/assets/scan-gate.js" not in footer:
        footer = footer.replace(
            '  <script src="/script.js"></script>',
            '  <script src="/assets/scan-gate.js"></script>\n'
            '  <script src="/script.js"></script>',
        )
    return head, footer


def load_template_parts() -> tuple[str, str, str]:
    text = TEMPLATE.read_text()
    head_end = text.index("</head>") + len("</head>")
    nav_start = text.index('<nav id="nav"')
    main_start = text.index("<main class=\"container\">")
    footer_start = text.index('<footer class="footer">')
    head = text[:head_end]
    nav = text[nav_start:main_start]
    footer = text[footer_start:]
    head, footer = inject_gate_assets(head, footer)
    return head, nav, footer


def parse_h1(raw: str) -> tuple[str, str]:
    raw = re.sub(r"<[^>]+>", "", raw).strip()
    if "—" in raw:
        left, right = raw.split("—", 1)
        return left.strip(), right.strip()
    if " - " in raw:
        left, right = raw.split(" - ", 1)
        return left.strip(), right.strip()
    return raw, ""


def strip_tags(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text)


def adapt_qual_html(fragment: str) -> str:
    out = fragment
    for old, new in VAR_REPLACEMENTS:
        out = out.replace(old, new)
    return out


def classify_section(title: str) -> str:
    t = title.lower()
    if "tech" in t:
        return "tech"
    if "citation" in t or "stance" in t:
        return "citation"
    if "sentinel" in t:
        return "sentinel"
    if "strategic" in t or "insight" in t:
        return "strategic"
    if "fix" in t:
        return "fix"
    return "other"


def parse_qualitative(path: Path) -> dict:
    raw = path.read_text()
    h1_m = re.search(r"<h1>(.*?)</h1>", raw, re.S)
    sub_m = re.search(r'<p class="sub">(.*?)</p>', raw, re.S)
    foot_m = re.search(r'<div class="foot">(.*?)</div>', raw, re.S)

    after_sub_m = re.search(r'<p class="sub">.*?</p>\s*(.*?)(?=<div class="foot">)', raw, re.S)
    sections: dict[str, tuple[str, str]] = {}
    if after_sub_m:
        body = after_sub_m.group(1)
        split = re.split(r"<h2>", body, maxsplit=1)
        preamble = split[0].strip() if split else ""
        if len(split) > 1:
            for part in re.split(r"<h2>", split[1]):
                if not part.strip():
                    continue
                end = part.find("</h2>")
                if end < 0:
                    continue
                title = part[:end].strip()
                content = part[end + 5 :].strip()
                key = classify_section(title)
                if key == "other":
                    continue
                if key == "tech" and preamble:
                    content = f"{preamble}\n{content}"
                sections[key] = (title, content)

    h1_raw = h1_m.group(1) if h1_m else ""
    title, subtitle = parse_h1(h1_raw)
    return {
        "title": title,
        "subtitle": subtitle,
        "sub": sub_m.group(1).strip() if sub_m else "",
        "sections": sections,
        "foot": foot_m.group(1).strip() if foot_m else "",
    }


def build_prompt_intel(prompts_data: dict) -> str:
    prompts = prompts_data.get("prompts", [])
    by_stage: dict[str, list[str]] = {}
    for p in prompts:
        by_stage.setdefault(p["stage"], []).append(p["text"])

    total = len(prompts)
    stage_count = len(by_stage)
    left_stages = ["discover", "compare"]
    right_stages = ["validate"]

    def stage_block(stage: str) -> str:
        items = by_stage.get(stage, [])
        icon = STAGE_ICONS.get(stage, stage.upper())
        chips = "".join(f'<span class="chip">{html.escape(t)}</span>' for t in items[:4])
        return (
            f'<h4>{icon} <span style="color:var(--text-dim);font-weight:400">'
            f"({len(items)} prompts)</span></h4>"
            f'<div class="chips" style="margin-bottom:18px">{chips}</div>'
        )

    left = "".join(stage_block(s) for s in left_stages if s in by_stage)
    right = "".join(stage_block(s) for s in right_stages if s in by_stage)

    return f"""      <h2><span class="num">1</span>Prompt Intel — the buyer prompt universe <span class="tag p">Agent output</span></h2>
      <p class="sub">{total} prompts generated across {stage_count} intent stages. Sample below.</p>
      <div class="card">
        <div class="grid2">
          <div>{left}</div>
          <div>{right}</div>
        </div>
      </div>"""


def sov_row(label: str, count: int, max_count: int, color: str, you: bool = False) -> str:
    width = max(4, round(100 * count / max_count)) if max_count else 4
    you_cls = " you" if you else ""
    return (
        f'<div class="sov-row"><span class="sov-label{you_cls}">{html.escape(label)}</span>'
        f'<div class="sov-track"><span class="sov-fill" style="width:{width}%;background:{color}"></span></div>'
        f'<span class="sov-count{you_cls}">{count}</span></div>'
    )


def build_visibility(data: dict, brand: str, run_date: str) -> str:
    s = data["summary"]
    total = s["total_answers"]
    mentions = s["brand_mention_count"]
    rate = s["brand_mention_rate"]
    engines = list(s["per_engine"].keys())
    engine_count = len(engines)

    disc = s["per_stage"].get("discover", {"answered": 0, "brand_mentions": 0})
    comp = s["per_stage"].get("compare", {"answered": 0, "brand_mentions": 0})
    val = s["per_stage"].get("validate", {"answered": 0, "brand_mentions": 0})
    disc_rate = pct(disc["brand_mentions"], disc["answered"])
    comp_rate = pct(comp["brand_mentions"], comp["answered"])
    val_rate = pct(val["brand_mentions"], val["answered"])

    comps = s.get("competitor_mentions", {})
    cmax = max(list(comps.values()) + [mentions, 1])
    palette = ["var(--scan-blue)", "var(--scan-purple)", "var(--scan-warn)", "var(--text-dim)",
               "var(--scan-good)", "var(--scan-blue)", "var(--scan-purple)"]
    comp_bars = sov_row(f"{brand} (you)", mentions, cmax, "var(--accent-warm)", you=True)
    for i, (name, count) in enumerate(comps.items()):
        comp_bars += sov_row(name, count, cmax, palette[i % len(palette)])

    domains = {d: n for d, n in s.get("top_citation_domains", {}).items() if d not in NOISE_DOMAINS}
    own_tokens = [
        data.get("company", "").lower(),
        brand.lower().replace(" ", ""),
    ]
    domain_rows = ""
    dmax = max(list(domains.values()) + [1])
    for d, n in list(domains.items())[:12]:
        owned = any(t and t in d for t in own_tokens if t)
        color = "var(--accent-warm)" if owned else "var(--scan-blue)"
        domain_rows += sov_row(d, n, dmax, color, you=owned)

    top_cites = " · ".join(f"{d} {n}" for d, n in list(domains.items())[:8])
    engine_list = ", ".join(ENGINE_LABELS.get(e, e) for e in engines)

    eng_kpis = ""
    for eng, v in s["per_engine"].items():
        p = pct(v["brand_mentions"], v["answered"])
        label = ENGINE_LABELS.get(eng, eng)
        eng_kpis += (
            f'<div class="kpi"><div class="l">{html.escape(label)}</div>'
            f'<div class="v" style="color:{color_for(p)}">{p}%</div>'
            f'<div class="d">{v["brand_mentions"]} / {v["answered"]}</div></div>'
        )

    return f"""      <h2><span class="num">2</span>Visibility Scout — measured across {total} live AI answers <span class="tag g">Measured {run_date}</span></h2>
      <p class="sub">Buyer prompts run against {engine_list}. Every answer parsed for brand mentions, competitors and citations.</p>

      <div class="grid4" style="margin-bottom:16px">
        <div class="kpi"><div class="l">Overall mention rate</div><div class="v" style="color:{color_for(rate)}">{rate}%</div><div class="d">{mentions} of {total} answers</div></div>
        <div class="kpi"><div class="l">Discover stage<br>(buyer doesn't name you)</div><div class="v" style="color:{color_for(disc_rate)}">{disc_rate}%</div><div class="d">{disc["brand_mentions"]} / {disc["answered"]} answers</div></div>
        <div class="kpi"><div class="l">Compare stage</div><div class="v" style="color:{color_for(comp_rate)}">{comp_rate}%</div><div class="d">{comp["brand_mentions"]} / {comp["answered"]}</div></div>
        <div class="kpi"><div class="l">Validate stage</div><div class="v" style="color:{color_for(val_rate)}">{val_rate}%</div><div class="d">{val["brand_mentions"]} / {val["answered"]}</div></div>
      </div>

      <div class="grid4" style="margin-bottom:16px">{eng_kpis}</div>

      <div class="card">
        <h3 style="margin-bottom:10px">Share of voice — who AI mentions across all {total} answers</h3>
        {comp_bars}
      </div>

      <div class="card">
        <h3 style="margin-bottom:4px">Citation-domain landscape — top domains cited <span class="tag g">Measured</span></h3>
        <p style="font-size:12.5px;margin-bottom:12px"><b>Measured top citations:</b> {html.escape(top_cites)}.</p>
        {domain_rows}
      </div>"""


def build_qual_sections(sections: dict[str, tuple[str, str]]) -> str:
    out = []
    for key, num, tag_label, tag_cls in SECTION_ORDER:
        if key not in sections:
            continue
        title, content = sections[key]
        tag = f' <span class="tag {tag_cls}">{tag_label}</span>' if tag_label and tag_cls else ""
        if key == "fix":
            heading = "Prioritized fix queue"
        elif key == "strategic":
            heading = "Strategic insight — the pitch"
        else:
            heading = re.sub(r"^Tech [Rr]eadiness.*", "Tech Readiness — GEO audit", title)
            heading = re.sub(r"^Citation.*", "Citation landscape — who shapes AI answers", heading)
            heading = re.sub(r"^Brand Sentinel.*", "Brand Sentinel — what AI likely tells your buyers", heading)
        out.append(
            f'      <h2><span class="num">{num}</span>{html.escape(heading)}{tag}</h2>\n'
            f"      {adapt_qual_html(content)}"
        )
    return "\n\n".join(out)


def format_run_date(run_at: str) -> str:
    try:
        dt = datetime.fromisoformat(run_at.replace("Z", "+00:00"))
        return dt.strftime("%b %-d, %Y")
    except ValueError:
        return run_at[:10] if run_at else "Jun 10, 2026"


def build_page(slug: str) -> Path:
    co_dir = RESULTS / slug
    scan_path = co_dir / "scan-results.json"
    qual_path = co_dir / "qualitative-report.html"
    prompts_path = COMPANIES / slug / "prompts.json"

    data = json.loads(scan_path.read_text())
    qual = parse_qualitative(qual_path)
    prompts_data = json.loads(prompts_path.read_text()) if prompts_path.exists() else {"prompts": []}

    brand = data.get("brand") or qual["title"] or slug
    title = qual["title"] or brand
    subtitle = qual["subtitle"]
    run_at = data.get("run_at", "")
    run_date = format_run_date(run_at)
    s = data["summary"]
    total = s["total_answers"]
    engine_count = len(s["per_engine"])

    head, nav, footer = load_template_parts()
    head = re.sub(
        r"<title>.*?</title>",
        f"<title>{html.escape(brand)} AI Visibility Scan · RevForgeHQ</title>",
        head,
        count=1,
    )
    head = re.sub(
        r'<meta name="description" content="[^"]*"',
        f'<meta name="description" content="RevForge AI visibility scan for {html.escape(brand)} — '
        f'AEO/GEO prompt intel, measured SOV, brand sentinel findings, and prioritized fix queue."',
        head,
        count=1,
    )

    subtitle_html = (
        f' <span class="page-title-sub">({html.escape(subtitle)})</span>' if subtitle else ""
    )
    intro = adapt_qual_html(qual["sub"])
    prompt_intel = build_prompt_intel(prompts_data)
    visibility = build_visibility(data, brand, run_date.split(",")[0].strip() if "," in run_date else "Jun 10")
    qual_sections = build_qual_sections(qual["sections"])

    what_next = f"""      <h2>What happens next</h2>
      <div class="grid3">
        <div class="kpi"><div class="l">✓ Delivered: live scoreboard</div><div class="d" style="margin-top:6px">{len(prompts_data.get("prompts", []))} prompts × {engine_count} engines, {total} verbatim answers captured and scored</div></div>
        <div class="kpi"><div class="l">Next: execute the fix queue</div><div class="d" style="margin-top:6px">Priorities from §7 — owned content, technical GEO fixes, and source-landscape outreach</div></div>
        <div class="kpi"><div class="l">Next: weekly volatility watch</div><div class="d" style="margin-top:6px">Same prompt set re-run weekly — win/loss alerts, hallucination monitoring, monthly board-ready SOV trend</div></div>
      </div>"""

    method_foot = (
        f'<b>Method &amp; sources:</b> Engine scan {run_date}: buyer prompts × '
        f'{", ".join(ENGINE_LABELS.get(e, e) for e in s["per_engine"])} = {total} analyzed answers; '
        "mentions, competitor mentions and citation domains computed programmatically from verbatim responses. "
        f'{adapt_qual_html(qual["foot"])}'
    )

    body = f"""{nav}
  <main class="container">
    <a href="/demos/" class="back-link">← Demo gallery</a>

    <p class="page-eyebrow">RevForge · AI Visibility Scan</p>
    <h1 class="page-title">{html.escape(title)}{subtitle_html}</h1>
    <div class="page-meta" aria-label="Report metadata">
      <span class="measured">Measured · {total} live AI answers · {engine_count} engines</span>
      <span>{run_date}</span>
      <span>Internal — not indexed</span>
    </div>

    <div class="optavia-scan">
      <p class="sub">{intro}</p>

{prompt_intel}

{visibility}

{qual_sections}

{what_next}

      <div class="foot">
        {method_foot}
      </div>
    </div>
  </main>

  {footer}"""

    page = head + "\n<body class=\"page-inner optavia-page\">\n\n" + body
    out_dir = ROOT / slug
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "index.html"
    out_path.write_text(page)
    return out_path


def main() -> None:
    slugs = sorted(
        p.name
        for p in RESULTS.iterdir()
        if p.is_dir() and (p / "scan-results.json").exists() and (p / "qualitative-report.html").exists()
    )
    if not slugs:
        raise SystemExit(f"No scan results found under {RESULTS}")

    for slug in slugs:
        path = build_page(slug)
        print(f"✓ {slug} → {path.relative_to(ROOT)}")

    print(f"\n{len(slugs)} pages generated.")


if __name__ == "__main__":
    main()
