// radar-runner — a reliable 1-minute Cloudflare cron that drives Radar scans.
//
// Cloudflare Pages/the site Worker can't be relied on to fire crons, so this
// dedicated Worker exists purely to tick every minute and ping the site's
// /api/radar/run endpoint. The SITE worker does the actual scan -> rich report
// -> email and self-heals stuck jobs; it already holds every engine/DB secret
// and runs on the Workers Paid plan (full CPU + subrequest budget).
//
// Because the site does the work, this runner needs NO API/DB keys — only the
// shared RADAR_RUNNER_KEY to authenticate to the endpoint. That sidesteps the
// fact that Cloudflare secret values can't be read back to copy onto a 2nd Worker.

interface Env {
  RADAR_RUNNER_KEY?: string;
  PUBLIC_BASE_URL?: string;
}

async function tick(env: Env): Promise<{ status: number; body: string }> {
  const base = (env.PUBLIC_BASE_URL || "https://www.revforgehq.com").replace(/\/$/, "");
  // max=1 keeps each invocation bounded (~one scan); the 1-min cadence plus
  // overlapping ticks (SKIP LOCKED claim) gives concurrency across jobs.
  const r = await fetch(`${base}/api/radar/run?max=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RADAR_RUNNER_KEY ?? ""}` },
  });
  return { status: r.status, body: (await r.text()).slice(0, 800) };
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      tick(env)
        .then(({ status, body }) => { if (status !== 200) console.error("radar-runner tick non-200", status, body); })
        .catch((e) => console.error("radar-runner tick error", e)),
    );
  },

  // Manual trigger for testing — same key as the run endpoint.
  async fetch(request: Request, env: Env): Promise<Response> {
    const expected = env.RADAR_RUNNER_KEY?.trim();
    if (!expected || request.headers.get("Authorization") !== `Bearer ${expected}`) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const { status, body } = await tick(env);
    return Response.json({ ok: status === 200, upstream_status: status, upstream_body: body });
  },
};
