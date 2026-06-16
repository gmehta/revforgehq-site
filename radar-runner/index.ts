// radar-runner — standalone Cloudflare Worker that drives the Radar scan queue.
//
// Why this exists: Cloudflare Pages cannot run scheduled handlers, so first-scan
// jobs queued on email verification never got processed automatically. A real
// Worker's cron trigger fires reliably every minute. Each tick:
//   1. self-heals jobs stuck 'running' (e.g. an evicted/crashed pass) by
//      re-queuing them — bounded by job age so a pathological job is eventually
//      marked 'failed' instead of retrying (and billing) forever;
//   2. drains queued jobs by reusing the exact same processOneScanJob pipeline
//      the rest of the app uses (scan -> rich report -> email).
//
// Reuses functions/lib so there is one source of truth for the scan logic.

import type { Env } from "../functions/lib/env.js";
import { getSql } from "../functions/lib/db.js";
import { processOneScanJob } from "../functions/lib/radar-scan.js";

const STUCK_MINUTES = 10;   // a pass should finish well within this
const GIVEUP_HOURS = 2;     // after this long unfinished, stop retrying (bounds cost)
const MAX_PER_TICK = 5;     // jobs to drain per minute (1-min cadence handles the rest)

interface DrainResult { requeued: number; failed: number; processed: number; errors: string[] }

async function drain(env: Env): Promise<DrainResult> {
  const sql = getSql(env.DATABASE_URL);

  // 1a. Recover jobs whose worker died mid-scan (still 'running', not too old).
  const requeued = await sql`
    UPDATE radar_scan_jobs SET status = 'queued', started_at = NULL
    WHERE status = 'running'
      AND started_at < NOW() - (${STUCK_MINUTES} || ' minutes')::interval
      AND created_at  > NOW() - (${GIVEUP_HOURS} || ' hours')::interval
    RETURNING id`;

  // 1b. Stop retrying jobs that have been failing far too long — mark failed so
  // they stop being re-queued (and billed) every minute.
  const failed = await sql`
    UPDATE radar_scan_jobs SET status = 'failed', finished_at = NOW(),
      error = COALESCE(error, 'gave up after repeated incomplete scans')
    WHERE status = 'running'
      AND started_at < NOW() - (${STUCK_MINUTES} || ' minutes')::interval
      AND created_at  <= NOW() - (${GIVEUP_HOURS} || ' hours')::interval
    RETURNING id`;

  // 2. Drain queued jobs (sequential; SKIP LOCKED claim makes overlapping ticks safe).
  let processed = 0;
  const errors: string[] = [];
  for (let i = 0; i < MAX_PER_TICK; i++) {
    const r = await processOneScanJob(env);
    if (r.error) { errors.push(r.error); break; }
    if (!r.processed) break;            // queue drained
    processed += r.processed;
  }
  return { requeued: requeued.length, failed: failed.length, processed, errors };
}

export default {
  // Cloudflare cron — the primary driver.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(drain(env).catch((e) => { console.error("radar-runner drain failed", e); }));
  },

  // Manual trigger for E2E testing / on-demand drains. Guarded by RADAR_RUNNER_KEY.
  async fetch(request: Request, env: Env): Promise<Response> {
    const expected = env.RADAR_RUNNER_KEY?.trim();
    if (!expected) return Response.json({ ok: false, error: "RADAR_RUNNER_KEY not configured" }, { status: 503 });
    if (request.headers.get("Authorization") !== `Bearer ${expected}`) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const result = await drain(env);
    return Response.json({ ok: true, ...result });
  },
};
