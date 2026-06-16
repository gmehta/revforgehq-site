import type { Env } from "../../lib/env.js";
import { jsonResponse, requireRunnerKey, requireDatabaseUrl } from "../../lib/env.js";
import { getSql } from "../../lib/db.js";
import { processOneScanJob } from "../../lib/radar-scan.js";

// POST /api/radar/run?max=N   (Bearer RADAR_RUNNER_KEY)
// Drives the Radar scan pipeline (real scan → rich report → email) and self-heals
// the queue. The standalone radar-runner Worker pings this every minute on a
// Cloudflare-native cron; all engine/DB secrets live here on the site, which runs
// on the Workers Paid plan (full CPU + subrequest budget).
const STUCK_MINUTES = 10;   // a pass should finish well within this
const GIVEUP_HOURS = 2;     // stop retrying jobs unfinished this long (bounds cost)

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = requireRunnerKey(request, env);
  if (auth instanceof Response) return auth;

  const max = Math.min(5, Math.max(1, parseInt(new URL(request.url).searchParams.get("max") ?? "1", 10) || 1));
  const sql = getSql(requireDatabaseUrl(env));

  // Self-heal: re-queue jobs whose worker died mid-scan; fail ones that have been
  // stuck far too long so they stop being retried (and billed) every minute.
  const requeued = await sql`
    UPDATE radar_scan_jobs SET status='queued', started_at=NULL
    WHERE status='running'
      AND started_at < NOW() - (${STUCK_MINUTES} || ' minutes')::interval
      AND created_at  > NOW() - (${GIVEUP_HOURS} || ' hours')::interval
    RETURNING id`;
  const failed = await sql`
    UPDATE radar_scan_jobs SET status='failed', finished_at=NOW(),
      error=COALESCE(error,'gave up after repeated incomplete scans')
    WHERE status='running'
      AND started_at < NOW() - (${STUCK_MINUTES} || ' minutes')::interval
      AND created_at  <= NOW() - (${GIVEUP_HOURS} || ' hours')::interval
    RETURNING id`;

  const runs: Array<{ processed: number; reportId?: string; error?: string }> = [];
  for (let i = 0; i < max; i++) {
    const r = await processOneScanJob(env);
    runs.push(r);
    if (r.error) break;          // surface the failure
    if (!r.processed) break;     // queue drained
  }
  const processed = runs.reduce((n, r) => n + r.processed, 0);
  return jsonResponse({ ok: true, processed, requeued: requeued.length, failed: failed.length, runs });
};
