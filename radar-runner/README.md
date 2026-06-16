# radar-runner

Standalone Cloudflare Worker that processes the Radar scan-job queue on a
1-minute cron. Cloudflare **Pages cannot run scheduled handlers**, so this lives
as its own Worker (deployed with `wrangler deploy`, separate from the Pages site).

## What it does each minute
1. Re-queues jobs stuck `running` > 10 min (recovers crashed/evicted passes).
2. Marks jobs unfinished after 2 hours as `failed` (stops infinite retries/billing).
3. Drains up to 5 `queued` jobs via the shared `processOneScanJob` pipeline
   (scan → rich report → email). The claim uses `FOR UPDATE ... SKIP LOCKED`,
   so overlapping ticks never double-process a job.

First report SLA: a signup queued at any time is picked up within ~1 minute and
finishes in ~2–3 minutes — comfortably inside the 1-hour target.

## Deploy

```bash
cd radar-runner
npx wrangler deploy            # deploys the Worker + registers the cron
```

## Secrets (set once, match the Pages project values)

```bash
cd radar-runner
npx wrangler secret put DATABASE_URL
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put PERPLEXITY_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put SERP_API_KEY            # optional (Google AI Overviews)
npx wrangler secret put POSTMARK_SERVER_TOKEN   # report-ready emails
npx wrangler secret put RADAR_FROM_EMAIL        # optional; code has a default
npx wrangler secret put RADAR_RUNNER_KEY        # optional; only for the manual /fetch trigger
```

Non-secret config (`OPENAI_MODEL`, `OPENAI_NARRATIVE_MODEL`, `PUBLIC_BASE_URL`)
is in `wrangler.toml [vars]`.

## Manual trigger (testing)

```bash
curl -X POST https://radar-runner.<your-subdomain>.workers.dev \
  -H "Authorization: Bearer $RADAR_RUNNER_KEY"
# -> {"ok":true,"requeued":0,"failed":0,"processed":1,"errors":[]}
```

## Schema
No migration required — uses the existing `radar_scan_jobs` columns
(`status`, `started_at`, `created_at`, `report_id`, `error`).
