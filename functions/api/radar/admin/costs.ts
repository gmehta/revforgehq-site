import { getSql } from "../../../lib/db.js";
import type { Env } from "../../../lib/env.js";
import { jsonResponse, requireDatabaseUrl } from "../../../lib/env.js";
import { requireAdmin } from "../../../lib/admin.js";

// Per-call engine list prices (architecture §16.2, June 2026). Kept in sync with
// the runner's ENGINE_COST. cost/report = prompts × sum(prices of scanned engines).
const PRICES = { openai: 0.038, perplexity: 0.029, gemini: 0.028, aioverview: 0.03 };
const PER_PROMPT_ALL4 = PRICES.openai + PRICES.perplexity + PRICES.gemini + PRICES.aioverview; // 0.125
const PRO_REPORT_COST = Math.round(50 * PER_PROMPT_ALL4 * 100) / 100; // 50 prompts × 4 engines = $6.25
const FREE_REPORT_COST = Math.round(15 * PRICES.openai * 100) / 100; // 15 prompts × 1 engine = $0.57

// GET /api/radar/admin/costs — LLM cost analytics (auth: admin session cookie).
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  const sql = getSql(requireDatabaseUrl(env));

  const [totals, byEngine, byTier, byClient, active] = await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(cost_usd),0)::float8 AS modeled_all,
        COALESCE(SUM(cost_usd) FILTER (WHERE NOT is_mock),0)::float8 AS real_all,
        COUNT(*)::int AS reports,
        COUNT(*) FILTER (WHERE NOT is_mock)::int AS real_reports,
        COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= date_trunc('day',now())),0)::float8 AS modeled_today,
        COALESCE(SUM(cost_usd) FILTER (WHERE NOT is_mock AND created_at >= date_trunc('day',now())),0)::float8 AS real_today,
        COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= now()-interval '7 days'),0)::float8 AS modeled_7d,
        COALESCE(SUM(cost_usd) FILTER (WHERE NOT is_mock AND created_at >= now()-interval '7 days'),0)::float8 AS real_7d,
        COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= now()-interval '30 days'),0)::float8 AS modeled_30d,
        COALESCE(SUM(cost_usd) FILTER (WHERE NOT is_mock AND created_at >= now()-interval '30 days'),0)::float8 AS real_30d
      FROM radar_reports`,
    sql`
      WITH prices(engine,cost) AS (VALUES ('openai',0.038::numeric),('perplexity',0.029),('gemini',0.028),('aioverview',0.030))
      SELECT e.engine,
             SUM(r.prompt_count)::int AS calls,
             ROUND(SUM(r.prompt_count * p.cost),2)::float8 AS cost_modeled,
             ROUND(COALESCE(SUM(r.prompt_count * p.cost) FILTER (WHERE NOT r.is_mock),0),2)::float8 AS cost_real
      FROM radar_reports r
      CROSS JOIN LATERAL unnest(r.engines) AS e(engine)
      JOIN prices p ON p.engine = e.engine
      GROUP BY e.engine ORDER BY cost_modeled DESC`,
    sql`
      SELECT tier,
             COUNT(*)::int AS reports,
             ROUND(SUM(cost_usd),2)::float8 AS cost,
             ROUND(COALESCE(SUM(cost_usd) FILTER (WHERE NOT is_mock),0),2)::float8 AS cost_real
      FROM radar_reports GROUP BY tier ORDER BY cost DESC`,
    sql`
      SELECT a.email, b.brand_name, a.plan,
             COUNT(r.id)::int AS reports,
             ROUND(SUM(r.cost_usd),2)::float8 AS cost,
             ROUND(AVG(r.cost_usd),3)::float8 AS avg_cost,
             ROUND(COALESCE(SUM(r.cost_usd) FILTER (WHERE NOT r.is_mock),0),2)::float8 AS cost_real,
             MAX(r.created_at) AS last_report
      FROM radar_reports r
      JOIN radar_accounts a ON a.id = r.account_id
      JOIN radar_brands b ON b.id = r.brand_id
      GROUP BY a.email, b.brand_name, a.plan
      ORDER BY cost DESC LIMIT 50`,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE plan IN ('pro_trial','pro','scale') AND status='active' AND trial_ends_at > now())::int AS active_pro,
        COUNT(*) FILTER (WHERE plan='free' AND status='active')::int AS active_free
      FROM radar_accounts`,
  ]);

  const a0 = active[0] ?? { active_pro: 0, active_free: 0 };
  // Projection at FULL config (50-prompt Pro daily, 15-prompt Free weekly), all real.
  const projDaily = (a0.active_pro as number) * PRO_REPORT_COST + (a0.active_free as number) * (FREE_REPORT_COST / 7);

  return jsonResponse({
    ok: true,
    generated_at: new Date().toISOString(),
    model: {
      prices: PRICES,
      per_prompt_all4: PER_PROMPT_ALL4,
      pro_report_cost: PRO_REPORT_COST,
      free_report_cost: FREE_REPORT_COST,
      note: "Modeled from engine list prices × prompts × engines. Locked per report at generation time.",
    },
    totals: totals[0],
    by_engine: byEngine,
    by_tier: byTier,
    by_client: byClient,
    active: a0,
    projection: {
      active_pro: a0.active_pro,
      active_free: a0.active_free,
      daily_full_real: Math.round(projDaily * 100) / 100,
      monthly_full_real: Math.round(projDaily * 30 * 100) / 100,
    },
  });
};
