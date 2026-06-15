import type { Env } from "../../lib/env.js";
import { jsonResponse, requireRunnerKey } from "../../lib/env.js";
import { processOneScanJob } from "../../lib/radar-scan.js";

// POST /api/radar/run?max=N   (Bearer RADAR_RUNNER_KEY)
// Processes queued Radar scan jobs (real scan → report → email). Cloudflare
// Pages does NOT fire wrangler cron triggers, so an external scheduler (the
// GitHub Actions workflow .github/workflows/radar-cron.yml, or any cron service)
// hits this endpoint on an interval to drive the pipeline.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = requireRunnerKey(request, env);
  if (auth instanceof Response) return auth;

  const max = Math.min(5, Math.max(1, parseInt(new URL(request.url).searchParams.get("max") ?? "3", 10) || 3));
  const runs: Array<{ processed: number; reportId?: string; error?: string }> = [];
  for (let i = 0; i < max; i++) {
    const r = await processOneScanJob(env);
    runs.push(r);
    if (r.error) break;          // surface the failure
    if (!r.processed) break;     // queue drained
  }
  const processed = runs.reduce((n, r) => n + r.processed, 0);
  return jsonResponse({ ok: true, processed, runs });
};
