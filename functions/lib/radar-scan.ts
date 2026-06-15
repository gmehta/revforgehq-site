// RevForgeHQ Radar — serverless scan + report pipeline (runs in the Worker on a
// 1-min cron). Ports revforge-scan/{scan.py, make_reports.py, radar_runner.py}
// so reports generate on Cloudflare with no local runner / Mac.
//
// Requires these Worker secrets (wrangler secret put / dashboard):
//   OPENAI_API_KEY, PERPLEXITY_API_KEY, GEMINI_API_KEY   (engines)
//   SERP_API_KEY  (optional — enables Google AI Overviews)
// Plus the existing DATABASE_URL, POSTMARK_SERVER_TOKEN, RADAR_FROM_EMAIL, PUBLIC_BASE_URL.
import { getSql, type Sql } from "./db.js";
import type { Env } from "./env.js";
import { sendPostmarkEmail } from "./postmark.js";
import { buildReportReadyEmail, logSignupEvent, radarFromEmail } from "./radar.js";

const TIMEOUT_MS = 45_000;
const CONCURRENCY = 8;          // max parallel engine calls per job
const RETRY = 1;

interface TierCfg { engines: string[]; promptLimit: number; }
function tierFor(plan: string): TierCfg {
  if (plan === "free") return { engines: ["openai"], promptLimit: 15 };
  return { engines: ["openai", "perplexity", "gemini", "aioverview"], promptLimit: 50 }; // pro_trial | pro | scale
}
const ENGINE_COST: Record<string, number> = { openai: 0.005, perplexity: 0.008, gemini: 0.004, aioverview: 0.03 };
const ENGINE_LABEL: Record<string, string> = {
  openai: "ChatGPT (API)", perplexity: "Perplexity", gemini: "Gemini", aioverview: "Google AI Overviews",
};

interface EngineResult { text: string; citations: string[]; noOverview?: boolean; }
interface ScanRow {
  prompt_id: number; stage: string; prompt: string; engine: string;
  text?: string; citations?: string[]; error?: string;
  brand_mentioned?: boolean; competitors_mentioned?: string[];
}

// ---- engines (ports scan.py request shapes) --------------------------------
async function fetchJson(url: string, init: RequestInit): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function askOpenAI(env: Env, prompt: string): Promise<EngineResult> {
  const data = await fetchJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.OPENAI_MODEL?.trim() || "gpt-4o-mini", tools: [{ type: "web_search" }], input: prompt }),
  });
  let text = ""; const cites: string[] = [];
  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text") {
        text += part.text ?? "";
        for (const ann of part.annotations ?? []) if (ann.type === "url_citation" && ann.url) cites.push(ann.url);
      }
    }
  }
  return { text, citations: cites };
}

async function askPerplexity(env: Env, prompt: string): Promise<EngineResult> {
  const data = await fetchJson("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.PPLX_MODEL?.trim() || "sonar", messages: [{ role: "user", content: prompt }] }),
  });
  const text = data.choices?.[0]?.message?.content ?? "";
  const cites: string[] = data.citations ?? (data.search_results ?? []).map((s: any) => s.url ?? "").filter(Boolean);
  return { text, citations: cites };
}

async function askGemini(env: Env, prompt: string): Promise<EngineResult> {
  const model = env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
  });
  const cand = data.candidates?.[0] ?? {};
  const text = (cand.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
  const cites: string[] = [];
  for (const chunk of cand.groundingMetadata?.groundingChunks ?? []) {
    const uri = chunk.web?.uri; if (uri) cites.push(uri);
  }
  return { text, citations: cites };
}

function aioText(blocks: any[], out: string[]) {
  for (const b of blocks ?? []) {
    if (b.snippet) out.push(b.snippet);
    if (b.title) out.push(b.title);
    for (const item of b.list ?? []) {
      if (item.title) out.push(item.title);
      if (item.snippet) out.push(item.snippet);
      aioText(item.text_blocks, out);
    }
    aioText(b.text_blocks, out);
  }
}
async function askAIOverview(env: Env, prompt: string): Promise<EngineResult> {
  const key = env.SERP_API_KEY ?? "";
  const q = new URLSearchParams({ engine: "google", q: prompt, api_key: key, hl: "en", gl: "us" });
  let aio = (await fetchJson(`https://serpapi.com/search?${q}`, { method: "GET" })).ai_overview ?? {};
  if (aio.page_token) {
    const q2 = new URLSearchParams({ engine: "google_ai_overview", page_token: aio.page_token, api_key: key });
    aio = (await fetchJson(`https://serpapi.com/search?${q2}`, { method: "GET" })).ai_overview ?? aio;
  }
  const parts: string[] = []; aioText(aio.text_blocks, parts);
  const cites = (aio.references ?? []).map((r: any) => r.link ?? "").filter(Boolean);
  return { text: parts.join("\n"), citations: cites, noOverview: !(parts.length || cites.length) };
}

function engineFn(name: string): (env: Env, p: string) => Promise<EngineResult> {
  return { openai: askOpenAI, perplexity: askPerplexity, gemini: askGemini, aioverview: askAIOverview }[name]!;
}
function engineAvailable(env: Env, name: string): boolean {
  return ({
    openai: !!env.OPENAI_API_KEY, perplexity: !!env.PERPLEXITY_API_KEY,
    gemini: !!env.GEMINI_API_KEY, aioverview: !!env.SERP_API_KEY,
  } as Record<string, boolean>)[name] ?? false;
}

// ---- analysis (ports scan.py) ---------------------------------------------
function domainOf(url: string): string {
  const m = /^https?:\/\/(?:www\.)?([^/]+)/.exec(url || "");
  return m ? m[1].toLowerCase() : "";
}
function findMentions(text: string, aliases: string[]): boolean {
  const low = " " + text.toLowerCase() + " ";
  for (const a of aliases) {
    if (a === a.toUpperCase() && a.length >= 3) {
      if (new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) return true;
    } else if (low.includes(a.toLowerCase())) return true;
  }
  return false;
}

interface Summary {
  total_answers: number; brand_mention_count: number; brand_mention_rate: number;
  per_engine: Record<string, { answered: number; brand_mentions: number }>;
  per_stage: Record<string, { answered: number; brand_mentions: number }>;
  competitor_mentions: Record<string, number>;
  top_citation_domains: Record<string, number>;
}
function analyze(rows: ScanRow[], brand: { aliases: string[]; domains: string[] }, comps: Record<string, string[]>): Summary {
  const perEngine: Summary["per_engine"] = {};
  const perStage: Summary["per_stage"] = {};
  const compCounts: Record<string, number> = {};
  const citeDomains: Record<string, number> = {};
  for (const row of rows) {
    if (row.error || row.text == null) continue;
    const { engine, stage, text } = row;
    (perEngine[engine] ??= { answered: 0, brand_mentions: 0 }).answered++;
    (perStage[stage] ??= { answered: 0, brand_mentions: 0 }).answered++;
    const mentioned = findMentions(text, brand.aliases);
    row.brand_mentioned = mentioned;
    if (mentioned) { perEngine[engine].brand_mentions++; perStage[stage].brand_mentions++; }
    row.competitors_mentioned = [];
    for (const [comp, aliases] of Object.entries(comps)) {
      if (findMentions(text, aliases)) { compCounts[comp] = (compCounts[comp] ?? 0) + 1; row.competitors_mentioned.push(comp); }
    }
    for (const url of row.citations ?? []) {
      const d = domainOf(url); if (!d) continue;
      citeDomains[d] = (citeDomains[d] ?? 0) + 1;
    }
  }
  const total = Object.values(perEngine).reduce((s, v) => s + v.answered, 0);
  const totalBrand = Object.values(perEngine).reduce((s, v) => s + v.brand_mentions, 0);
  const sortDesc = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
  return {
    total_answers: total, brand_mention_count: totalBrand,
    brand_mention_rate: total ? Math.round((1000 * totalBrand) / total) / 10 : 0,
    per_engine: perEngine, per_stage: perStage,
    competitor_mentions: sortDesc(compCounts), top_citation_domains: sortDesc(citeDomains),
  };
}

// ---- scan one brand with bounded concurrency ------------------------------
async function runPool<T>(items: T[], limit: number, worker: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx]); }
  });
  await Promise.all(runners);
}
async function scanBrand(env: Env, brandAliases: string[], prompts: { id: number; stage: string; text: string }[], engines: string[]): Promise<ScanRow[]> {
  const tasks: { p: { id: number; stage: string; text: string }; eng: string }[] = [];
  for (const p of prompts) for (const eng of engines) tasks.push({ p, eng });
  const rows: ScanRow[] = [];
  await runPool(tasks, CONCURRENCY, async ({ p, eng }) => {
    const row: ScanRow = { prompt_id: p.id, stage: p.stage, prompt: p.text, engine: eng };
    for (let attempt = 0; attempt <= RETRY; attempt++) {
      try {
        const out = await engineFn(eng)(env, p.text);
        row.text = out.text; row.citations = out.citations; break;
      } catch (e) {
        if (attempt === RETRY) row.error = String(e instanceof Error ? e.message : e).slice(0, 300);
      }
    }
    rows.push(row);
  });
  return rows;
}

// ---- report HTML (ports make_reports.build) -------------------------------
function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const colorFor = (p: number) => (p >= 50 ? "var(--good)" : p >= 25 ? "var(--gold)" : "var(--bad)");
function bar(label: string, n: number, max: number, color: string): string {
  const w = max ? Math.round((100 * n) / max) : 0;
  return `<div class="barrow"><span class="bl">${esc(label)}</span><span class="bt"><span class="bf" style="width:${w}%;background:${color}"></span></span><span class="bn">${n}</span></div>`;
}
const REPORT_CSS = `:root{--bg:#0b0e14;--panel:#121723;--panel2:#1a2130;--line:#232c3f;--txt:#e8edf6;--mut:#8b97ad;--acc:#ff6b35;--gold:#d4b878;--good:#34d399;--bad:#f87171;--warn:#fbbf24;--blue:#60a5fa;--purp:#a78bfa;--rad:14px;--mono:'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace}
*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--txt);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55}
.wrap{max-width:1080px;margin:0 auto;padding:34px 28px 80px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px}
.logo{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:19px;letter-spacing:-.02em;color:#f4ede0}.logo .f{font-style:italic;color:#d4b878}.logo .scan{font-family:var(--mono);font-style:normal;color:var(--mut);font-size:12px;font-weight:600;letter-spacing:.08em}
.badge{font-size:11px;font-weight:700;letter-spacing:.6px;padding:5px 12px;border-radius:99px;background:rgba(52,211,153,.12);color:var(--good);border:1px solid rgba(52,211,153,.3)}
h1{font-size:30px;font-weight:800;margin:18px 0 6px}h2{font-size:20px;font-weight:800;margin:40px 0 10px}
.sub{color:var(--mut);max-width:840px;margin-bottom:18px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--rad);padding:22px;margin-bottom:16px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}@media(max-width:760px){.grid4{grid-template-columns:1fr 1fr}}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:var(--rad);padding:18px}
.kpi .l{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);font-weight:700}
.kpi .v{font-size:30px;font-weight:800;margin:8px 0 2px;font-variant-numeric:tabular-nums}.kpi .d{font-size:12px;color:var(--mut)}
.barrow{display:flex;align-items:center;gap:12px;margin-bottom:9px;font-size:13px}.barrow .bl{width:170px;flex:0 0 170px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.barrow .bt{flex:1;height:9px;background:rgba(255,255,255,.05);border-radius:99px;overflow:hidden}.barrow .bf{display:block;height:100%;border-radius:99px}
.barrow .bn{width:34px;text-align:right;color:var(--mut);font-weight:700;font-variant-numeric:tabular-nums}
blockquote{background:var(--panel2);border-left:3px solid var(--acc);border-radius:0 10px 10px 0;padding:12px 16px;margin:10px 0;font-size:13px;color:var(--mut)}blockquote b{color:var(--txt)}
.foot{color:var(--mut);font-size:12.5px;margin-top:30px;border-top:1px solid var(--line);padding-top:18px}`;

function buildReportHtml(brand: string, company: string, s: Summary, rows: ScanRow[], runDate: string): string {
  const disc = s.per_stage["discover"] ?? { answered: 0, brand_mentions: 0 };
  const discRate = pct(disc.brand_mentions, disc.answered);
  let engRows = "", stageRows = "";
  for (const [eng, v] of Object.entries(s.per_engine)) {
    const p = pct(v.brand_mentions, v.answered);
    engRows += `<div class="kpi"><div class="l">${esc(ENGINE_LABEL[eng] ?? eng)}</div><div class="v" style="color:${colorFor(p)}">${p}%</div><div class="d">${v.brand_mentions} / ${v.answered}</div></div>`;
  }
  for (const [st, v] of Object.entries(s.per_stage)) {
    const p = pct(v.brand_mentions, v.answered);
    stageRows += `<div class="kpi"><div class="l">${esc(st[0].toUpperCase() + st.slice(1))} stage</div><div class="v" style="color:${colorFor(p)}">${p}%</div><div class="d">${v.brand_mentions} / ${v.answered} answers</div></div>`;
  }
  const comps = s.competitor_mentions;
  const cmax = Math.max(...Object.values(comps), s.brand_mention_count, 1);
  const palette = ["var(--blue)", "var(--purp)", "var(--warn)", "var(--mut)", "var(--good)"];
  let compBars = bar(`${brand} (you)`, s.brand_mention_count, cmax, "var(--acc)");
  Object.entries(comps).forEach(([c, n], i) => { compBars += bar(c, n, cmax, palette[i % palette.length]); });
  const ownTokens = [company, brand.toLowerCase().replace(/\s+/g, "")].filter(Boolean);
  const domains = Object.entries(s.top_citation_domains).filter(([d]) => d !== "vertexaisearch.cloud.google.com");
  const dmax = Math.max(...domains.map(([, n]) => n), 1);
  let domBars = "";
  for (const [d, n] of domains.slice(0, 18)) {
    const owned = ownTokens.some((t) => t && d.includes(t));
    domBars += bar(d, n, dmax, owned ? "var(--acc)" : "var(--blue)");
  }
  const ownCites = domains.filter(([d]) => ownTokens.some((t) => t && d.includes(t))).reduce((s2, [, n]) => s2 + n, 0);
  let quotes = ""; const seen = new Set<string>();
  for (const a of rows) {
    if (a.error || !a.text || a.stage !== "validate" || seen.has(a.engine)) continue;
    seen.add(a.engine);
    quotes += `<blockquote><b>[${esc(a.engine)}] ${esc(a.prompt)}</b><br>${esc(a.text.replace(/\s+/g, " ").slice(0, 380))}…</blockquote>`;
    if (seen.size >= 3) break;
  }
  const total = s.total_answers, mentions = s.brand_mention_count, rate = s.brand_mention_rate;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Visibility Scan — ${esc(brand)}</title><style>${REPORT_CSS}</style></head><body><div class="wrap">
<div class="hdr"><div class="logo">Rev<span class="f">Forge</span>HQ<span class="scan"> · AI Visibility Scan</span></div>
<span class="badge">MEASURED · ${total} LIVE AI ANSWERS · ${esc(runDate)}</span></div>
<h1>${esc(brand)}</h1>
<p class="sub">Buyer prompts executed live against ChatGPT (API w/ web search), Perplexity, Google AI Overviews and Gemini. Every answer parsed for brand mentions, competitor mentions and citation sources.</p>
<div class="grid4" style="margin-bottom:16px">
<div class="kpi"><div class="l">Overall mention rate</div><div class="v" style="color:${colorFor(rate)}">${rate}%</div><div class="d">${mentions} of ${total} answers</div></div>
<div class="kpi"><div class="l">Discover stage (unbranded)</div><div class="v" style="color:${colorFor(discRate)}">${discRate}%</div><div class="d">where buyers don't name you</div></div>
<div class="kpi"><div class="l">Own-site citations</div><div class="v" style="color:var(--blue)">${ownCites}</div><div class="d">links to owned domains</div></div>
<div class="kpi"><div class="l">Engines scanned</div><div class="v">${Object.keys(s.per_engine).length}</div><div class="d">${total} parsed answers</div></div>
</div>
<h2>Per engine</h2><div class="grid4">${engRows}</div>
<h2>Per buying stage</h2><div class="grid4">${stageRows}</div>
<h2>Share of voice — who AI mentions</h2><div class="card">${compBars}<p style="color:var(--mut);font-size:12.5px;margin-top:10px">Mention counts across all ${total} answers. Competitor counts include branded comparison prompts.</p></div>
<h2>Citation sources — the domains shaping these answers</h2><div class="card">${domBars || '<p style="color:var(--mut)">No citations captured.</p>'}<p style="color:var(--mut);font-size:12.5px;margin-top:10px">Orange = owned domains.</p></div>
<h2>Sample verbatims — validation prompts</h2><div class="card">${quotes || '<p style="color:var(--mut)">No verbatims captured.</p>'}</div>
<div class="foot"><b>Method:</b> Live engine scan ${esc(runDate)}; answers parsed programmatically (mention detection, competitor aliases, citation extraction). Prepared by RevForgeHQ — AI Visibility Engine.</div>
</div></body></html>`;
}

// ---- helpers --------------------------------------------------------------
function randToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function inferStage(text: string, brandAliases: string[]): string {
  const t = text.toLowerCase();
  if (findMentions(text, brandAliases)) return /\bvs\b|compare|alternative/.test(t) ? "compare" : "branded";
  if (/\bvs\b|compare|alternative|best .* for/.test(t)) return "compare";
  if (/review|worth it|pricing|legit|cancel/.test(t)) return "validate";
  return "discover";
}
function brandAliasesFor(name: string, domain: string): string[] {
  const root = domain.split(".")[0] ?? "";
  return [...new Set([name, name.toLowerCase(), name.toLowerCase().replace(/\s+/g, ""), root].filter((a) => a && a.length >= 2))];
}

// ---- orchestration: process one queued scan job ---------------------------
export async function processOneScanJob(env: Env): Promise<{ processed: number; reportId?: string; error?: string }> {
  if (!env.OPENAI_API_KEY) return { processed: 0, error: "no engine keys configured" };
  const sql = getSql(env.DATABASE_URL!);

  const jobs = await sql`
    SELECT j.id, j.brand_id, j.kind, b.brand_name, b.domain, b.account_id, a.plan, a.email, a.full_name
    FROM radar_scan_jobs j
    JOIN radar_brands b ON b.id = j.brand_id
    JOIN radar_accounts a ON a.id = b.account_id
    WHERE j.status = 'queued' AND a.status = 'active'
    ORDER BY j.created_at LIMIT 1`;
  if (!jobs.length) return { processed: 0 };
  const job = jobs[0] as { id: string; brand_id: string; kind: string; brand_name: string; domain: string; account_id: string; plan: string; email: string; full_name: string };

  // Claim the job (only one cron tick wins the row).
  const claim = await sql`UPDATE radar_scan_jobs SET status = 'running', started_at = NOW() WHERE id = ${job.id} AND status = 'queued' RETURNING id`;
  if (!claim.length) return { processed: 0 };

  try {
    const cfg = tierFor(job.plan);
    const engines = cfg.engines.filter((e) => engineAvailable(env, e));
    if (!engines.length) throw new Error("no engines available (missing API keys)");

    const brandAliases = brandAliasesFor(job.brand_name, job.domain);
    const promptRows = await sql`SELECT prompt_text, stage FROM radar_tracked_prompts WHERE brand_id = ${job.brand_id} AND active ORDER BY id LIMIT ${cfg.promptLimit}`;
    const compRows = await sql`SELECT competitor_name FROM radar_competitors WHERE brand_id = ${job.brand_id}`;
    const prompts = promptRows.map((r: any, i: number) => ({
      id: i + 1,
      stage: (r.stage && String(r.stage).trim()) || inferStage(r.prompt_text, brandAliases),
      text: r.prompt_text as string,
    }));
    const comps: Record<string, string[]> = {};
    for (const c of compRows) comps[c.competitor_name] = [String(c.competitor_name).toLowerCase()];
    if (!prompts.length) throw new Error("no active prompts for brand");

    const rows = await scanBrand(env, brandAliases, prompts, engines);
    const summary = analyze(rows, { aliases: brandAliases, domains: [job.domain] }, comps);
    const runDate = new Date().toISOString().slice(0, 10);
    const html = buildReportHtml(job.brand_name, job.domain.split(".")[0] ?? "", summary, rows, runDate);
    const cost = Math.round(prompts.length * engines.reduce((s, e) => s + (ENGINE_COST[e] ?? 0), 0) * 10000) / 10000;
    const reportId = crypto.randomUUID();
    const viewToken = randToken();
    const title = `${job.brand_name} — AI Visibility Scan`;

    await sql`
      INSERT INTO radar_reports (id, brand_id, account_id, job_id, kind, tier, title, html, summary, mention_rate, engines, prompt_count, is_mock, view_token, cost_usd)
      VALUES (${reportId}, ${job.brand_id}, ${job.account_id}, ${job.id}, ${job.kind}, ${job.plan}, ${title}, ${html}, ${JSON.stringify(summary)}::jsonb, ${summary.brand_mention_rate}, ${engines}, ${prompts.length}, FALSE, ${viewToken}, ${cost})`;
    await sql`UPDATE radar_scan_jobs SET status = 'done', finished_at = NOW(), report_id = ${reportId} WHERE id = ${job.id}`;
    await sql`UPDATE radar_brands SET last_report_id = ${reportId}, last_report_at = NOW() WHERE id = ${job.brand_id}`;

    // Report-ready email (separate from the verify email).
    const token = env.POSTMARK_SERVER_TOKEN?.trim();
    if (token) {
      const base = (env.PUBLIC_BASE_URL?.trim() || "https://www.revforgehq.com").replace(/\/$/, "");
      const url = `${base}/api/radar/report?id=${reportId}&t=${encodeURIComponent(viewToken)}`;
      const { text, html: emailHtml } = buildReportReadyEmail(job.full_name ?? "", job.brand_name ?? "your brand", url);
      try {
        await sendPostmarkEmail({
          token, from: `RevForgeHQ Radar <${radarFromEmail(env.RADAR_FROM_EMAIL)}>`,
          to: job.email, subject: `Your ${job.brand_name} AI visibility report is ready`, textBody: text, htmlBody: emailHtml,
        });
        await logSignupEvent(sql, { email: job.email, event: "report_email_sent", detail: reportId });
      } catch { /* email best-effort */ }
    }
    return { processed: 1, reportId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sql`UPDATE radar_scan_jobs SET status = 'failed', finished_at = NOW(), error = ${msg.slice(0, 500)} WHERE id = ${job.id}`;
    return { processed: 0, error: msg };
  }
}
