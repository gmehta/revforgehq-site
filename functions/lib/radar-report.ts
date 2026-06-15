// Rich executive AI-visibility report generator for the Radar Worker pipeline.
//
// This reproduces the depth of the bespoke /bill and /fabletics sample reports
// inside the live scan path. Three layers, each degrading gracefully:
//   1. Deterministic analytics from the scan rows (scoreboard, position
//      distribution, mention share, citations, verbatims, full prompt explorer).
//   2. A live site audit (brand + top competitor) for grounded schema facts.
//   3. One LLM synthesis pass that writes the narrative sections, grounded
//      strictly in #1 + #2.
// If the audit or LLM step fails, the deterministic sections + explorer still
// render — far richer than the old 5-section scoreboard, and we never throw.

import type { Env } from "./env.js";
import type { ScanRow, Summary } from "./radar-scan.js";
import { ENGINE_LABEL } from "./radar-scan.js";

export interface ReportCtx {
  brand: string;
  domain: string;
  runDate: string;
  plan: string;
  summary: Summary;
  rows: ScanRow[];
  brandAliases: string[];
  comps: Record<string, string[]>;
}

// ---- small helpers --------------------------------------------------------
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const colorFor = (p: number) => (p >= 50 ? "var(--good)" : p >= 25 ? "var(--warn)" : "var(--bad)");
const toneVar: Record<string, string> = { bad: "var(--bad)", warn: "var(--warn)", good: "var(--good)" };
function clamp(s: string, n: number): string {
  s = String(s ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ---- deterministic analytics ----------------------------------------------
interface Analytics {
  total: number;
  rate: number;
  mentions: number;
  perEngine: Array<{ engine: string; label: string; answered: number; mentions: number; rate: number }>;
  perStage: Array<{ stage: string; answered: number; mentions: number; rate: number }>;
  discoverNamedFirstPct: number;
  discoverAnswers: number;
  typicalPosition: number | null;
  positionDist: Array<{ label: string; count: number }>;
  mentionShare: Array<{ name: string; count: number; you: boolean }>;
  citations: Array<{ domain: string; count: number; owned: boolean }>;
  ownCites: number;
  topCompetitor: string | null;
  verbatims: Array<{ prompt: string; engine: string; excerpt: string; tone: string }>;
}

// First-occurrence index of any alias in text (lowercased), or Infinity.
function firstIdx(textLow: string, aliases: string[]): number {
  let best = Infinity;
  for (const a of aliases) {
    const t = a.toLowerCase();
    if (t.length < 2) continue;
    const i = textLow.indexOf(t);
    if (i >= 0 && i < best) best = i;
  }
  return best;
}

function computeAnalytics(ctx: ReportCtx): Analytics {
  const { summary: s, rows, brandAliases, comps, domain, brand } = ctx;
  const ownTokens = [domain.split(".")[0], brand.toLowerCase().replace(/\s+/g, "")].filter(Boolean) as string[];

  const perEngine = Object.entries(s.per_engine).map(([engine, v]) => ({
    engine, label: ENGINE_LABEL[engine] ?? engine, answered: v.answered, mentions: v.brand_mentions,
    rate: pct(v.brand_mentions, v.answered),
  }));
  const perStage = Object.entries(s.per_stage).map(([stage, v]) => ({
    stage, answered: v.answered, mentions: v.brand_mentions, rate: pct(v.brand_mentions, v.answered),
  }));

  // Position of brand among all brands named in each unbranded "discover" answer.
  const positions: number[] = [];
  let discoverAnswers = 0, namedFirst = 0;
  for (const r of rows) {
    if (r.error || !r.text || r.stage !== "discover") continue;
    discoverAnswers++;
    const low = r.text.toLowerCase();
    const brandIdx = firstIdx(low, brandAliases);
    if (!isFinite(brandIdx)) continue;
    // rank = 1 + number of competitors whose first mention precedes the brand's
    let ahead = 0;
    for (const aliases of Object.values(comps)) {
      const ci = firstIdx(low, aliases);
      if (isFinite(ci) && ci < brandIdx) ahead++;
    }
    const rank = ahead + 1;
    positions.push(rank);
    if (rank === 1) namedFirst++;
  }
  positions.sort((a, b) => a - b);
  const typicalPosition = positions.length ? positions[Math.floor((positions.length - 1) / 2)] : null;
  const distMap: Record<string, number> = {};
  for (const p of positions) {
    const key = p === 1 ? "Named 1st among brands" : p === 2 ? "Named 2nd among brands" : p === 3 ? "Named 3rd among brands" : "Named 4th+ (effectively invisible)";
    distMap[key] = (distMap[key] ?? 0) + 1;
  }
  const positionDist = ["Named 1st among brands", "Named 2nd among brands", "Named 3rd among brands", "Named 4th+ (effectively invisible)"]
    .filter((k) => distMap[k]).map((label) => ({ label, count: distMap[label] }));

  const mentionShare = [
    { name: `${brand} (you)`, count: s.brand_mention_count, you: true },
    ...Object.entries(s.competitor_mentions).map(([name, count]) => ({ name, count, you: false })),
  ].sort((a, b) => b.count - a.count).slice(0, 9);
  const topCompetitor = Object.keys(s.competitor_mentions)[0] ?? null;

  const citeEntries = Object.entries(s.top_citation_domains).filter(([d]) => d !== "vertexaisearch.cloud.google.com");
  const citations = citeEntries.slice(0, 18).map(([domain, count]) => ({
    domain, count, owned: ownTokens.some((t) => domain.includes(t)),
  }));
  const ownCites = citeEntries.filter(([d]) => ownTokens.some((t) => d.includes(t))).reduce((a, [, n]) => a + n, 0);

  // Worst-answer verbatims: prioritise discover/validate answers that miss the brand.
  const scored = rows.filter((r) => !r.error && r.text).map((r) => {
    let score = 0;
    if (!r.brand_mentioned) score += 3;
    if (r.stage === "discover") score += 2;
    if (r.stage === "validate") score += 1;
    score += (r.competitors_mentioned?.length ?? 0);
    return { r, score };
  }).sort((a, b) => b.score - a.score);
  const verbatims = scored.slice(0, 5).map(({ r }) => ({
    prompt: r.prompt, engine: ENGINE_LABEL[r.engine] ?? r.engine,
    excerpt: clamp(r.text!, 420),
    tone: r.brand_mentioned ? "warn" : "bad",
  }));

  return {
    total: s.total_answers, rate: s.brand_mention_rate, mentions: s.brand_mention_count,
    perEngine, perStage,
    discoverNamedFirstPct: pct(namedFirst, discoverAnswers), discoverAnswers,
    typicalPosition, positionDist, mentionShare, citations, ownCites,
    topCompetitor, verbatims,
  };
}

// ---- live site audit ------------------------------------------------------
interface SiteFacts {
  domain: string;
  reachable: boolean;
  jsonLdTypes: string[];
  hasOrganization: boolean;
  hasSoftwareApp: boolean;
  hasFaqPage: boolean;
  h2Count: number;
  imgTotal: number;
  imgAltPct: number;
  llmsTxt: boolean;
  robotsOpen: boolean | null;
  title: string;
}

async function fetchText(url: string, ms = 8000): Promise<{ ok: boolean; status: number; body: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "RevForgeHQ-Radar/1.0 (+https://www.revforgehq.com)" }, redirect: "follow" });
    const body = r.ok ? (await r.text()).slice(0, 600_000) : "";
    return { ok: r.ok, status: r.status, body };
  } catch {
    return { ok: false, status: 0, body: "" };
  } finally {
    clearTimeout(t);
  }
}

async function auditSite(domain: string): Promise<SiteFacts> {
  const facts: SiteFacts = {
    domain, reachable: false, jsonLdTypes: [], hasOrganization: false, hasSoftwareApp: false,
    hasFaqPage: false, h2Count: 0, imgTotal: 0, imgAltPct: 0, llmsTxt: false, robotsOpen: null, title: "",
  };
  const home = await fetchText(`https://${domain}/`);
  if (home.ok && home.body) {
    facts.reachable = true;
    const html = home.body;
    facts.title = clamp((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ""), 120);
    facts.h2Count = (html.match(/<h2\b/gi) ?? []).length;
    const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
    facts.imgTotal = imgs.length;
    const withAlt = imgs.filter((t) => /\balt\s*=\s*["'][^"']+["']/i.test(t)).length;
    facts.imgAltPct = imgs.length ? Math.round((100 * withAlt) / imgs.length) : 0;
    const types = new Set<string>();
    for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const collect = (o: any) => {
          if (!o || typeof o !== "object") return;
          if (Array.isArray(o)) { o.forEach(collect); return; }
          const t = o["@type"];
          if (typeof t === "string") types.add(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
          if (o["@graph"]) collect(o["@graph"]);
        };
        collect(JSON.parse(m[1].trim()));
      } catch { /* malformed JSON-LD — ignore */ }
    }
    facts.jsonLdTypes = [...types];
    const lt = facts.jsonLdTypes.map((t) => t.toLowerCase());
    facts.hasOrganization = lt.some((t) => t.includes("organization"));
    facts.hasSoftwareApp = lt.some((t) => t.includes("softwareapplication") || t.includes("product"));
    facts.hasFaqPage = lt.some((t) => t.includes("faqpage"));
  }
  const [llms, robots] = await Promise.all([
    fetchText(`https://${domain}/llms.txt`, 5000),
    fetchText(`https://${domain}/robots.txt`, 5000),
  ]);
  facts.llmsTxt = llms.ok && llms.body.trim().length > 0;
  if (robots.ok) facts.robotsOpen = !/^\s*disallow:\s*\/\s*$/im.test(robots.body);
  return facts;
}

function competitorDomainGuess(name: string): string | null {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug.length >= 3 ? `${slug}.com` : null;
}

// ---- LLM narrative synthesis ----------------------------------------------
interface Narrative {
  headline_sub?: string;
  exec_cards?: Array<{ title: string; body_html: string }>;
  cost_model?: { intro?: string; rows?: Array<{ scenario: string; prospects: string; wrongRate: string; dropoff: string; lost: string; arr: string }>; note?: string; multiplier?: { title: string; body: string } };
  forensics?: { intro?: string; rows?: Array<{ source: string; what: string; verdict: string; verdictClass?: string }>; diagnosis?: string };
  buyer_journey?: { intro?: string; turns?: Array<{ q: string; a: string }> };
  teardown?: { intro?: string; rows?: Array<{ dim: string; competitor: string; you: string }>; net?: string };
  site_audit?: { alerts?: Array<{ title: string; body: string; tone?: string }> };
  growth_bets?: { intro?: string; alerts?: Array<{ title: string; body: string; tone?: string }> };
  entity_defense?: { intro?: string; moves?: Array<{ label: string; what: string }> };
  plan_90?: { phases?: Array<{ title: string; body: string }> };
  try_prompts?: Array<{ q: string; exp: string }>;
}

function buildDigest(ctx: ReportCtx, a: Analytics, brandAudit: SiteFacts | null, compAudit: SiteFacts | null) {
  // Representative answer excerpts, prioritising the revealing ones.
  const ranked = ctx.rows.filter((r) => !r.error && r.text).map((r) => {
    let s = 0;
    if (!r.brand_mentioned) s += 3;
    if (r.stage === "discover") s += 2;
    if (r.stage === "validate") s += 1;
    s += (r.competitors_mentioned?.length ?? 0);
    return { r, s };
  }).sort((x, y) => y.s - x.s).slice(0, 32);
  const samples = ranked.map(({ r }) => ({
    stage: r.stage, engine: r.engine, brand_mentioned: !!r.brand_mentioned,
    competitors: r.competitors_mentioned ?? [], prompt: r.prompt, answer: clamp(r.text!, 650),
    citations: (r.citations ?? []).slice(0, 5),
  }));
  return {
    brand: ctx.brand, domain: ctx.domain, run_date: ctx.runDate, plan: ctx.plan,
    metrics: {
      total_answers: a.total, mention_rate: a.rate, mentions: a.mentions,
      discover_named_first_pct: a.discoverNamedFirstPct, typical_position: a.typicalPosition,
      per_engine: a.perEngine.map((e) => ({ engine: e.label, rate: e.rate, answered: e.answered })),
      per_stage: a.perStage.map((e) => ({ stage: e.stage, rate: e.rate, answered: e.answered })),
      mention_share: a.mentionShare.map((m) => ({ name: m.name, count: m.count })),
      top_citation_domains: a.citations.map((c) => ({ domain: c.domain, count: c.count, owned: c.owned })),
      top_competitor: a.topCompetitor,
    },
    site_audit: brandAudit,
    competitor_audit: compAudit,
    answer_samples: samples,
  };
}

const SYNTH_INSTRUCTIONS = `You are a senior AI-visibility (AEO/GEO) strategist writing the narrative sections of an executive report for the brand below. You are given REAL measured data from a live scan of AI engines plus a live audit of the brand's website. Write incisive, specific, board-ready analysis.

STRICT GROUNDING RULES:
- Use ONLY facts present in the supplied data (metrics, site_audit, competitor_audit, answer_samples). Quote real answer snippets and cite the real competitor name and real citation domains.
- NEVER invent pricing, schema findings, statistics, dates, or quotes. If a fact isn't in the data, don't state it.
- For the cost_model, produce an illustrative scenario table and explicitly frame the inputs as assumptions the team should replace with their funnel data.
- Keep prose tight and concrete. Prefer measured numbers over adjectives. No filler, no hedging boilerplate.
- body_html / body fields may contain inline <b> tags only. No other HTML.

Return ONLY a single JSON object (no markdown fence) with this shape (omit any section you cannot ground):
{
 "headline_sub": "1-2 sentence deck under the title — what we asked and what we audited",
 "exec_cards": [ {"title":"...","body_html":"..."} ]  // exactly 4, the 30-second version,
 "cost_model": {"intro":"...","rows":[{"scenario":"Conservative","prospects":"5,000","wrongRate":"15%","dropoff":"5%","lost":"38 / mo","arr":"$1.1M / yr"}],"note":"assumptions to replace...","multiplier":{"title":"...","body":"..."}},
 "forensics": {"intro":"...","rows":[{"source":"domain or source","what":"what it says","verdict":"short verdict","verdictClass":"win|lose|mix"}],"diagnosis":"..."},
 "buyer_journey": {"intro":"...","turns":[{"q":"buyer question","a":"what AI answered (from samples)"}]},
 "teardown": {"intro":"...","rows":[{"dim":"Product schema","competitor":"...","you":"..."}],"net":"..."},
 "site_audit": {"alerts":[{"title":"...","body":"...","tone":"bad|warn|good"}]},
 "growth_bets": {"intro":"...","alerts":[{"title":"...","body":"...","tone":"bad|warn|good"}]},
 "entity_defense": {"intro":"...","moves":[{"label":"1 · Entity anchor","what":"..."}]},
 "plan_90": {"phases":[{"title":"Days 1–30 · Stop the bleeding","body":"..."}]},  // exactly 3 phases,
 "try_prompts": [{"q":"a real prompt from the scan","exp":"what to watch for"}]  // 3
}`;

async function callOpenAIJson(env: Env, instructions: string, payload: unknown, ms = 90_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: env.OPENAI_NARRATIVE_MODEL?.trim() || env.OPENAI_MODEL?.trim() || "gpt-4o",
        input: `${instructions}\n\n=== SCAN + AUDIT DATA (JSON) ===\n${JSON.stringify(payload)}`,
        text: { format: { type: "json_object" } },
      }),
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
    const data: any = await r.json();
    let text = "";
    for (const item of data.output ?? []) {
      if (item.type !== "message") continue;
      for (const part of item.content ?? []) if (part.type === "output_text") text += part.text ?? "";
    }
    return text || (data.output_text ?? "");
  } finally {
    clearTimeout(t);
  }
}

function parseJsonLoose(s: string): any | null {
  if (!s) return null;
  try { return JSON.parse(s); } catch { /* fall through */ }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* ignore */ } }
  return null;
}

async function synthesize(env: Env, ctx: ReportCtx, a: Analytics, brandAudit: SiteFacts | null, compAudit: SiteFacts | null): Promise<Narrative | null> {
  if (!env.OPENAI_API_KEY) return null;
  try {
    const out = await callOpenAIJson(env, SYNTH_INSTRUCTIONS, buildDigest(ctx, a, brandAudit, compAudit));
    const parsed = parseJsonLoose(out);
    return parsed && typeof parsed === "object" ? (parsed as Narrative) : null;
  } catch {
    return null;
  }
}

// ---- rendering ------------------------------------------------------------
function sovRow(name: string, count: number, max: number, you: boolean, color?: string): string {
  const w = max ? Math.round((100 * count) / max) : 0;
  const c = color ?? (you ? "var(--acc)" : "var(--blue)");
  return `<div class="sov-row"><span class="sov-label${you ? " you" : ""}">${esc(name)}</span>` +
    `<span class="sov-track"><span class="sov-fill" style="width:${w}%;background:${c}"></span></span>` +
    `<span class="sov-count${you ? " you" : ""}">${count}</span></div>`;
}
function kpi(label: string, value: string, sub: string, color?: string): string {
  return `<div class="kpi"><div class="l">${esc(label)}</div><div class="v"${color ? ` style="color:${color}"` : ""}>${esc(value)}</div><div class="d">${esc(sub)}</div></div>`;
}
function inlineB(s: string): string {
  // allow only <b>...</b> from model output; escape everything else
  return esc(s).replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>");
}

function renderScoreboard(a: Analytics): string {
  const top = [
    kpi("Overall mention rate", `${a.rate}%`, `${a.mentions} of ${a.total} answers`, colorFor(a.rate)),
    kpi("Named first (discover)", `${a.discoverNamedFirstPct}%`, `of ${a.discoverAnswers} unbranded answers open with you`, colorFor(a.discoverNamedFirstPct)),
    kpi("Typical position when named", a.typicalPosition ? `${a.typicalPosition}${a.typicalPosition === 1 ? "st" : a.typicalPosition === 2 ? "nd" : a.typicalPosition === 3 ? "rd" : "th"} brand` : "—", "median across discover answers that include you"),
    kpi("Own-site citations", String(a.ownCites), "links to your owned domains", "var(--blue)"),
  ].join("");
  const eng = a.perEngine.map((e) => kpi(e.label, `${e.rate}%`, `${e.mentions} / ${e.answered} answers`, colorFor(e.rate))).join("");
  const stg = a.perStage.map((e) => kpi(`${e.stage[0].toUpperCase()}${e.stage.slice(1)} stage`, `${e.rate}%`, `${e.mentions} / ${e.answered} answers`, colorFor(e.rate))).join("");
  return `<h2>Visibility scoreboard</h2>
<div class="grid4" style="margin-bottom:14px">${top}</div>
<div class="grid4" style="margin-bottom:14px">${eng}</div>
<div class="grid4">${stg}</div>`;
}

function renderPositionDist(a: Analytics): string {
  if (!a.positionDist.length) return "";
  const max = Math.max(...a.positionDist.map((d) => d.count), 1);
  const colors = ["var(--good)", "var(--warn)", "var(--warn)", "var(--bad)"];
  const rows = a.positionDist.map((d, i) => sovRow(d.label, d.count, max, false, colors[i] ?? "var(--bad)")).join("");
  return `<h2>Mentioned ≠ recommended — where you land in the answer</h2>
<div class="card">${rows}<p class="note">Position of your first mention among brands in each unbranded "discover" answer. AI answers are read top-down — brands named 4th or later are effectively invisible.</p></div>`;
}

function renderMentionShare(a: Analytics): string {
  if (!a.mentionShare.length) return "";
  const max = Math.max(...a.mentionShare.map((m) => m.count), 1);
  const palette = ["var(--blue)", "var(--purp)", "var(--warn)", "var(--mut)", "var(--good)"];
  let i = 0;
  const rows = a.mentionShare.map((m) => sovRow(m.name, m.count, max, m.you, m.you ? "var(--acc)" : palette[i++ % palette.length])).join("");
  return `<h2>Who AI talks about — mention share</h2>
<div class="card">${rows}<p class="note">Mentions across all ${a.total} answers; competitor counts include comparison prompts.</p></div>`;
}

function renderCitations(a: Analytics): string {
  if (!a.citations.length) return `<h2>Who AI listens to — citation sources</h2><div class="card"><p class="note">No citations were captured in this scan.</p></div>`;
  const max = Math.max(...a.citations.map((c) => c.count), 1);
  const rows = a.citations.map((c) => sovRow(c.domain, c.count, max, c.owned, c.owned ? "var(--acc)" : "var(--blue)")).join("");
  return `<h2>Who AI listens to — citation sources</h2>
<div class="card">${rows}<p class="note">Orange = your owned domains. These are the sources engines pull from when answering about you.</p></div>`;
}

function renderVerbatims(a: Analytics): string {
  if (!a.verbatims.length) return "";
  const q = a.verbatims.map((v) =>
    `<blockquote class="${v.tone === "bad" ? "bad" : ""}"><b>"${esc(v.prompt)}"</b><br>${esc(v.excerpt)}<span class="src">— ${esc(v.engine)}${v.tone === "bad" ? " · you were not mentioned" : ""}</span></blockquote>`).join("");
  return `<h2>The answers, verbatim — what needs fixing</h2><div class="card">${q}</div>`;
}

function renderExec(n: Narrative): string {
  if (!n.exec_cards?.length) return "";
  const cards = n.exec_cards.slice(0, 4).map((c) =>
    `<div class="exec-item"><div class="t">${esc(c.title)}</div><p>${inlineB(c.body_html)}</p></div>`).join("");
  return `<div class="exec"><h3>The 30-second version</h3><div class="exec-grid">${cards}</div></div>`;
}

function renderCostModel(n: Narrative): string {
  const c = n.cost_model; if (!c) return "";
  const rows = (c.rows ?? []).map((r) =>
    `<tr><td><b>${esc(r.scenario)}</b></td><td>${esc(r.prospects)}</td><td>${esc(r.wrongRate)}</td><td>${esc(r.dropoff)}</td><td><b>${esc(r.lost)}</b></td><td style="color:var(--bad);font-weight:800">${esc(r.arr)}</td></tr>`).join("");
  const table = rows ? `<div class="card"><table><tr><th>Scenario</th><th>Prospects researching via AI / mo*</th><th>Hit a wrong answer*</th><th>Drop off*</th><th>Lost customers</th><th>First-year ARR at risk</th></tr>${rows}</table>${c.note ? `<p class="assume">*${inlineB(c.note)}</p>` : ""}${c.multiplier ? `<div class="alert w" style="margin-top:12px"><h4>${esc(c.multiplier.title)}</h4><p>${inlineB(c.multiplier.body)}</p></div>` : ""}</div>` : "";
  return `<h2>What a wrong answer costs — pipeline at risk</h2>${c.intro ? `<p class="sub" style="margin-bottom:12px">${inlineB(c.intro)}</p>` : ""}${table}`;
}

function renderForensics(n: Narrative): string {
  const f = n.forensics; if (!f?.rows?.length) return "";
  const cls = (v?: string) => (v === "win" ? "win" : v === "mix" ? "mix" : "lose");
  const rows = f.rows.map((r) =>
    `<tr><td>${esc(r.source)}</td><td>${inlineB(r.what)}</td><td><span class="cell ${cls(r.verdictClass)}">${esc(r.verdict)}</span></td></tr>`).join("");
  return `<h2>Hallucination forensics — where the wrong answers actually come from</h2>
<div class="card">${f.intro ? `<p style="margin-bottom:12px">${inlineB(f.intro)}</p>` : ""}<table><tr><th>Source cited</th><th>What it says</th><th>Verdict</th></tr>${rows}</table>${f.diagnosis ? `<p class="note">${inlineB(f.diagnosis)}</p>` : ""}</div>`;
}

function renderJourney(n: Narrative): string {
  const j = n.buyer_journey; if (!j?.turns?.length) return "";
  const turns = j.turns.map((t, i) =>
    `<div class="turn"><div class="tnum">${i + 1}</div><div class="tb"><div class="tq">"${esc(t.q)}"</div><div class="ta">${esc(clamp(t.a, 600))}</div></div></div>`).join("");
  return `<h2>The conversation you're losing — a buyer's real AI journey</h2>${j.intro ? `<p class="sub" style="margin-bottom:12px">${inlineB(j.intro)}</p>` : ""}<div class="card">${turns}</div>`;
}

function renderTeardown(n: Narrative, topCompetitor: string | null): string {
  const t = n.teardown; if (!t?.rows?.length) return "";
  const comp = topCompetitor ?? "the leader";
  const rows = t.rows.map((r) =>
    `<tr><td><b>${esc(r.dim)}</b></td><td>${inlineB(r.competitor)}</td><td>${inlineB(r.you)}</td></tr>`).join("");
  return `<h2>Why ${esc(comp)} wins the unbranded answer — a technical teardown</h2>${t.intro ? `<p class="sub" style="margin-bottom:12px">${inlineB(t.intro)}</p>` : ""}
<div class="card"><table class="tear"><tr><th></th><th>${esc(comp)}</th><th>You</th></tr>${rows}</table>${t.net ? `<p class="note">${inlineB(t.net)}</p>` : ""}</div>`;
}

function renderAuditFacts(brandAudit: SiteFacts | null): string {
  if (!brandAudit?.reachable) return "";
  const b = brandAudit;
  const yn = (v: boolean) => (v ? '<span class="cell win">present</span>' : '<span class="cell lose">missing</span>');
  return `<div class="card"><table><tr><th>Site signal (measured ${esc(b.domain)})</th><th>Finding</th></tr>
<tr><td>Organization schema</td><td>${yn(b.hasOrganization)}</td></tr>
<tr><td>SoftwareApplication / Product schema</td><td>${yn(b.hasSoftwareApp)}</td></tr>
<tr><td>FAQPage schema</td><td>${yn(b.hasFaqPage)}</td></tr>
<tr><td>JSON-LD types found</td><td>${b.jsonLdTypes.length ? esc(b.jsonLdTypes.join(", ")) : '<span class="cell lose">none</span>'}</td></tr>
<tr><td>Image alt-text coverage</td><td>${b.imgTotal ? `${b.imgAltPct}% (${b.imgTotal} images)` : "—"}</td></tr>
<tr><td>H2 headings on homepage</td><td>${b.h2Count}</td></tr>
<tr><td>llms.txt</td><td>${yn(b.llmsTxt)}</td></tr>
<tr><td>robots.txt</td><td>${b.robotsOpen === null ? "—" : b.robotsOpen ? '<span class="cell win">open to crawlers</span>' : '<span class="cell lose">blocks crawlers</span>'}</td></tr>
</table><p class="note">Live audit of ${esc(b.domain)} on ${esc(brandAudit.domain ? "" : "")} the scan date — the machine-readable signals engines rely on to identify and quote you.</p></div>`;
}

function renderSiteAudit(n: Narrative, brandAudit: SiteFacts | null): string {
  const alerts = n.site_audit?.alerts ?? [];
  const facts = renderAuditFacts(brandAudit);
  if (!alerts.length && !facts) return "";
  const cards = alerts.length
    ? `<div class="grid2">${alerts.map((al) => `<div class="alert" style="border-left-color:${toneVar[al.tone ?? "bad"] ?? "var(--bad)"}"><h4>${esc(al.title)}</h4><p>${inlineB(al.body)}</p></div>`).join("")}</div>`
    : "";
  return `<h2>Why this is happening — site &amp; narrative audit</h2>${facts}${cards}`;
}

function renderGrowth(n: Narrative): string {
  const g = n.growth_bets; if (!g?.alerts?.length) return "";
  const cards = g.alerts.map((al) => `<div class="alert" style="border-left-color:${toneVar[al.tone ?? "warn"] ?? "var(--warn)"}"><h4>${esc(al.title)}</h4><p>${inlineB(al.body)}</p></div>`).join("");
  return `<h2>Your growth bets are unguarded</h2>${g.intro ? `<p class="sub" style="margin-bottom:12px">${inlineB(g.intro)}</p>` : ""}<div class="grid2">${cards}</div>`;
}

function renderEntity(n: Narrative, brand: string): string {
  const e = n.entity_defense; if (!e?.moves?.length) return "";
  const rows = e.moves.map((m) => `<tr><td><b>${esc(m.label)}</b></td><td>${inlineB(m.what)}</td></tr>`).join("");
  return `<h2>Entity defense — making "${esc(brand)}" mean you</h2>
<div class="card">${e.intro ? `<p style="margin-bottom:10px">${inlineB(e.intro)}</p>` : ""}<table><tr><th>Move</th><th>What it does</th></tr>${rows}</table></div>`;
}

function renderTry(n: Narrative, a: Analytics, rows: ScanRow[]): string {
  let prompts = n.try_prompts;
  if (!prompts?.length) {
    // deterministic fallback: a discover, a compare, a validate prompt
    const pick = (stage: string) => rows.find((r) => r.stage === stage && r.prompt)?.prompt;
    prompts = [pick("discover"), pick("compare") ?? pick("branded"), pick("validate")].filter(Boolean).map((q) => ({ q: q!, exp: "see whether you appear, and which sources author the answer" }));
  }
  if (!prompts.length) return "";
  const rowsHtml = prompts.slice(0, 4).map((p) =>
    `<div class="tryrow"><span class="q">${esc(p.q)}</span><span class="exp">${esc(p.exp)}</span></div>`).join("");
  return `<h2>See it yourself — 30 seconds, no slides</h2>
<p class="sub" style="margin-bottom:12px">Don't take the report's word for it. Paste these into ChatGPT or Perplexity right now:</p>
<div class="card">${rowsHtml}</div>`;
}

function renderPlan(n: Narrative): string {
  const p = n.plan_90; if (!p?.phases?.length) return "";
  const phases = p.phases.slice(0, 3).map((ph) => `<div class="ph"><h4>${esc(ph.title)}</h4><p>${inlineB(ph.body)}</p></div>`).join("");
  return `<h2>The 90-day plan — how we'd run it</h2>${phases}`;
}

function renderExplorer(ctx: ReportCtx): string {
  const rows = ctx.rows.filter((r) => r.text || r.error);
  const stages = [...new Set(rows.map((r) => r.stage))];
  const engines = [...new Set(rows.map((r) => r.engine))];
  const stageBtns = ['<button class="fb active" data-f="stage" data-v="">All stages</button>',
    ...stages.map((s) => `<button class="fb" data-f="stage" data-v="${esc(s)}">${esc(s)}</button>`)].join("");
  const engineBtns = ['<button class="fb active" data-f="engine" data-v="">All engines</button>',
    ...engines.map((e) => `<button class="fb" data-f="engine" data-v="${esc(e)}">${esc(ENGINE_LABEL[e] ?? e)}</button>`)].join("");
  const mentionBtns = ['<button class="fb active" data-f="mention" data-v="">Any</button>',
    '<button class="fb" data-f="mention" data-v="yes">Mentioned</button>',
    '<button class="fb" data-f="mention" data-v="no">Not mentioned</button>'].join("");
  const items = rows.map((r) => {
    const cites = (r.citations ?? []).filter(Boolean);
    const citeHtml = cites.length ? `<div class="ex-cites">${cites.slice(0, 12).map((c) => `<a href="${esc(c)}" target="_blank" rel="noopener nofollow">${esc((/^https?:\/\/(?:www\.)?([^/]+)/.exec(c)?.[1] ?? c))}</a>`).join("")}</div>` : "";
    const body = r.error ? `<span class="ex-err">scan error: ${esc(r.error)}</span>` : esc(r.text ?? "");
    const tag = r.error ? "" : `<span class="ex-pill ${r.brand_mentioned ? "y" : "n"}">${r.brand_mentioned ? "mentioned" : "not mentioned"}</span>`;
    return `<div class="ex-row" data-stage="${esc(r.stage)}" data-engine="${esc(r.engine)}" data-mention="${r.brand_mentioned ? "yes" : "no"}">
<div class="ex-head"><span class="ex-q">${esc(r.prompt)}</span><span class="ex-meta"><span class="ex-eng">${esc(ENGINE_LABEL[r.engine] ?? r.engine)}</span><span class="ex-stage">${esc(r.stage)}</span>${tag}</span></div>
<div class="ex-body"><p>${body}</p>${citeHtml}</div></div>`;
  }).join("");
  return `<h2 id="explorer">Prompt explorer — every question, every answer</h2>
<p class="sub" style="margin-bottom:12px">All ${rows.length} captured answers. Filter by stage, engine, or whether you were mentioned; click any row for the full answer and its sources.</p>
<div class="card">
  <div class="filters"><div class="fg">${stageBtns}</div><div class="fg">${engineBtns}</div><div class="fg">${mentionBtns}</div></div>
  <div id="exlist">${items}</div>
</div>`;
}

const EXPLORER_JS = `<script>(function(){
var f={stage:"",engine:"",mention:""};
document.querySelectorAll('.fb').forEach(function(b){b.addEventListener('click',function(){
  var k=b.getAttribute('data-f');f[k]=b.getAttribute('data-v');
  document.querySelectorAll('.fb[data-f="'+k+'"]').forEach(function(x){x.classList.remove('active')});
  b.classList.add('active');apply();
});});
function apply(){document.querySelectorAll('.ex-row').forEach(function(r){
  var ok=(!f.stage||r.getAttribute('data-stage')===f.stage)&&(!f.engine||r.getAttribute('data-engine')===f.engine)&&(!f.mention||r.getAttribute('data-mention')===f.mention);
  r.style.display=ok?'':'none';
});}
document.querySelectorAll('.ex-head').forEach(function(h){h.addEventListener('click',function(){h.parentNode.classList.toggle('open');});});
})();</script>`;

const REPORT_CSS = `:root{--bg:#0b0e14;--panel:#121723;--panel2:#1a2130;--line:#232c3f;--txt:#e8edf6;--mut:#8b97ad;--dim:#5d6a82;--acc:#ff6b35;--gold:#d4b878;--good:#34d399;--bad:#f87171;--warn:#fbbf24;--blue:#60a5fa;--purp:#a78bfa;--rad:14px;--mono:'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace}
*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--txt);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6}
.wrap{max-width:1080px;margin:0 auto;padding:34px 28px 90px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px}
.logo{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:19px;letter-spacing:-.02em;color:#f4ede0}.logo .f{font-style:italic;color:#d4b878}.logo .scan{font-family:var(--mono);font-style:normal;color:var(--mut);font-size:12px;font-weight:600;letter-spacing:.08em}
.badge{font-size:11px;font-weight:700;letter-spacing:.6px;padding:5px 12px;border-radius:99px;background:rgba(52,211,153,.12);color:var(--good);border:1px solid rgba(52,211,153,.3)}
h1{font-size:30px;font-weight:800;margin:18px 0 6px}h2{font-size:21px;font-weight:800;margin:44px 0 10px}h3{font-size:17px;font-weight:700}h4{font-size:14px;font-weight:700;color:var(--txt);margin-bottom:6px}
.sub{color:var(--mut);max-width:840px;margin-bottom:18px}
.note{color:var(--mut);font-size:12.5px;margin-top:10px}.assume{color:var(--dim);font-size:12px;margin-top:10px;line-height:1.6}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--rad);padding:22px;margin-bottom:16px}
b{color:var(--txt);font-weight:600}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:820px){.grid4,.grid3,.grid2{grid-template-columns:1fr 1fr}}@media(max-width:560px){.grid4,.grid3,.grid2{grid-template-columns:1fr}}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:var(--rad);padding:18px}
.kpi .l{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);font-weight:700}
.kpi .v{font-size:26px;font-weight:800;margin:6px 0 2px;font-variant-numeric:tabular-nums}.kpi .d{font-size:12px;color:var(--mut)}
.exec{background:linear-gradient(135deg,rgba(255,107,53,.07),rgba(167,139,250,.05));border:1px solid var(--line);border-radius:var(--rad);padding:22px;margin:8px 0 8px}
.exec h3{margin-bottom:14px}.exec-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:680px){.exec-grid{grid-template-columns:1fr}}
.exec-item .t{font-weight:700;color:var(--txt);margin-bottom:6px;font-size:14px}.exec-item p{font-size:13px;color:var(--mut);line-height:1.55}.exec-item .n{font-size:22px;font-weight:800}
table{width:100%;border-collapse:collapse;font-size:13px}
th{font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);font-weight:700}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--mut)}tr:last-child td{border-bottom:none}
table.tear td:first-child{color:var(--txt);white-space:nowrap}
.cell{display:inline-block;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid transparent}
.cell.win{background:rgba(52,211,153,.13);color:var(--good);border-color:rgba(52,211,153,.3)}
.cell.lose{background:rgba(248,113,113,.12);color:var(--bad);border-color:rgba(248,113,113,.25)}
.cell.mix{background:rgba(251,191,36,.12);color:var(--warn);border-color:rgba(251,191,36,.25)}
.alert{border-left:3px solid var(--bad);background:var(--panel2);border-radius:0 10px 10px 0;padding:14px 18px;margin-bottom:12px;border-top:1px solid var(--line);border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.alert h4{font-size:14px;margin-bottom:5px}.alert p{font-size:13px;color:var(--mut);line-height:1.55}
.sov-row{display:flex;align-items:center;gap:14px;margin-bottom:11px}.sov-row:last-child{margin-bottom:0}
.sov-label{width:160px;flex:0 0 160px;font-size:13px;font-weight:600;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sov-label.you{color:var(--acc)}
.sov-track{flex:1;height:20px;background:var(--panel2);border:1px solid var(--line);border-radius:7px;overflow:hidden}.sov-fill{display:block;height:100%;border-radius:6px}
.sov-count{width:42px;text-align:right;font-weight:700;font-size:13px;color:var(--txt)}.sov-count.you{color:var(--acc)}
blockquote{background:var(--panel2);border-left:3px solid var(--warn);border-radius:0 10px 10px 0;padding:12px 16px;margin:10px 0;font-size:13px;color:var(--mut)}blockquote.bad{border-left-color:var(--bad)}blockquote b{color:var(--txt)}
.src{display:block;margin-top:7px;font-size:11px;color:var(--dim);font-family:var(--mono)}
.turn{display:flex;gap:14px;margin-bottom:14px}.turn:last-child{margin-bottom:0}
.tnum{flex:0 0 24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--acc);color:#1a0e06;font-weight:800;font-size:12px}
.tq{font-weight:700;color:var(--txt);margin-bottom:4px}.ta{font-size:13px;color:var(--mut);line-height:1.55}
.ph{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:0 10px 10px 0;padding:14px 18px;margin-bottom:12px}.ph p{font-size:13px;color:var(--mut);margin-top:4px;line-height:1.55}
.tryrow{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}.tryrow:last-child{border-bottom:none}
.tryrow .q{font-weight:600;color:var(--txt);font-size:13.5px}.tryrow .exp{color:var(--mut);font-size:12.5px;flex:1}
.filters{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}.fg{display:flex;gap:6px;flex-wrap:wrap}
.fb{font:inherit;font-size:12px;font-weight:600;color:var(--mut);background:var(--panel2);border:1px solid var(--line);border-radius:99px;padding:5px 12px;cursor:pointer}.fb.active{color:#1a0e06;background:var(--gold);border-color:var(--gold)}
.ex-row{border:1px solid var(--line);border-radius:10px;margin-bottom:8px;overflow:hidden}
.ex-head{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;cursor:pointer;align-items:flex-start;flex-wrap:wrap}.ex-head:hover{background:var(--panel2)}
.ex-q{font-weight:600;font-size:13.5px;color:var(--txt);flex:1;min-width:200px}
.ex-meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ex-eng,.ex-stage{font-size:10.5px;font-weight:700;color:var(--mut);border:1px solid var(--line);border-radius:99px;padding:2px 8px;text-transform:uppercase;letter-spacing:.04em}
.ex-pill{font-size:10.5px;font-weight:700;border-radius:99px;padding:2px 8px}.ex-pill.y{background:rgba(52,211,153,.13);color:var(--good)}.ex-pill.n{background:rgba(248,113,113,.12);color:var(--bad)}
.ex-body{display:none;padding:0 14px 14px;border-top:1px solid var(--line)}.ex-row.open .ex-body{display:block}
.ex-body p{font-size:13px;color:var(--mut);line-height:1.6;white-space:pre-wrap;margin-top:12px}
.ex-cites{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.ex-cites a{font-size:11px;color:var(--blue);text-decoration:none;border:1px solid var(--line);border-radius:99px;padding:2px 8px}.ex-cites a:hover{color:var(--acc)}
.ex-err{color:var(--bad);font-size:12.5px;font-family:var(--mono)}
.foot{color:var(--dim);font-size:12.5px;margin-top:40px;border-top:1px solid var(--line);padding-top:18px;line-height:1.6}`;

// ---- top-level builder ----------------------------------------------------
export async function buildRichReport(env: Env, ctx: ReportCtx): Promise<string> {
  const a = computeAnalytics(ctx);

  // Live site audit (best-effort, never blocks the report).
  let brandAudit: SiteFacts | null = null, compAudit: SiteFacts | null = null;
  try {
    const compDomain = a.topCompetitor ? competitorDomainGuess(a.topCompetitor) : null;
    const [b, c] = await Promise.all([
      auditSite(ctx.domain).catch(() => null),
      compDomain ? auditSite(compDomain).catch(() => null) : Promise.resolve(null),
    ]);
    brandAudit = b; compAudit = c?.reachable ? c : null;
  } catch { /* audit is optional */ }

  const n = await synthesize(env, ctx, a, brandAudit, compAudit);

  const sections = [
    n ? renderExec(n) : "",
    n ? renderCostModel(n) : "",
    renderScoreboard(a),
    renderPositionDist(a),
    renderMentionShare(a),
    renderCitations(a),
    renderVerbatims(a),
    n ? renderForensics(n) : "",
    n ? renderJourney(n) : "",
    n ? renderTeardown(n, a.topCompetitor) : "",
    renderSiteAudit(n ?? {}, brandAudit),
    n ? renderGrowth(n) : "",
    n ? renderEntity(n, ctx.brand) : "",
    renderTry(n ?? {}, a, ctx.rows),
    n ? renderPlan(n) : "",
    renderExplorer(ctx),
  ].filter(Boolean).join("\n");

  const headlineSub = (n?.headline_sub && inlineB(n.headline_sub)) ||
    `Buyer prompts executed live against ${a.perEngine.map((e) => e.label).join(", ")}. Every answer parsed for your mentions, competitor mentions and citation sources.`;
  const depth = n ? "EXECUTIVE" : "MEASURED";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Visibility Report — ${esc(ctx.brand)}</title><style>${REPORT_CSS}</style></head><body><div class="wrap">
<div class="hdr"><div class="logo">Rev<span class="f">Forge</span>HQ<span class="scan"> · AI Visibility Report</span></div>
<span class="badge">${depth} · ${a.total} LIVE AI ANSWERS · ${esc(ctx.runDate)}</span></div>
<h1>What AI tells ${esc(ctx.brand)}'s buyers</h1>
<p class="sub">${headlineSub}</p>
${sections}
<div class="foot"><b>Method:</b> Live engine scan on ${esc(ctx.runDate)} across ${a.perEngine.length} engines (${a.total} parsed answers). Mention detection, competitor aliases and citation extraction computed programmatically; narrative analysis synthesised from the measured data and a live audit of ${esc(ctx.domain)}. Prepared by RevForgeHQ — AI Visibility Engine.</div>
</div>${EXPLORER_JS}</body></html>`;
}
