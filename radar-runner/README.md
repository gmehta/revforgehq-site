# radar-runner

A tiny standalone Cloudflare Worker whose only job is a **reliable 1-minute
cron**. Cloudflare Pages / the site Worker can't be relied on to fire crons, so
this ticks every minute and pings the site's `/api/radar/run` endpoint.

The **site** does all the real work (scan → rich report → email) and self-heals
the queue — it already holds every engine/DB secret and runs on Workers Paid.
So this runner needs **no API or DB keys**, only the shared `RADAR_RUNNER_KEY`
to authenticate. (Cloudflare won't reveal existing secret values, so this avoids
having to copy keys onto a second Worker.)

## Deploy

```bash
cd radar-runner
npx wrangler deploy
```

## Secret (the only one)

```bash
# Must match RADAR_RUNNER_KEY on the site Worker (revforgehq-site).
npx wrangler secret put RADAR_RUNNER_KEY
```

`PUBLIC_BASE_URL` is set in `wrangler.toml [vars]`.

## How throughput works
Each tick pings `/api/radar/run?max=1`, so one invocation ≈ one scan (bounded).
The site claims jobs with `FOR UPDATE ... SKIP LOCKED`, so overlapping ticks
process different jobs concurrently. A signup at any time is picked up within
~1 minute and finishes in ~2–3 minutes — inside the 1-hour first-report SLA.

## Manual trigger (testing)

```bash
curl -X POST https://radar-runner.<subdomain>.workers.dev \
  -H "Authorization: Bearer $RADAR_RUNNER_KEY"
# -> {"ok":true,"upstream_status":200,"upstream_body":"{\"ok\":true,\"processed\":1,...}"}
```
