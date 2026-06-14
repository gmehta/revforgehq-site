# RevForge Radar — Deploy & Registration Runbook

> Launch page + self-serve 7-day trial signup for the AEO Daily Reporting Platform.
> Ships in the existing `revforgehq-site` **Cloudflare Worker** (Workers + static assets;
> `wrangler.toml` `main = ./dist/worker`, deployed with `wrangler deploy`). Branch: `radar-launch`.
> Note: this is a Worker, not a Pages project — secrets are Worker secrets and deploys are
> run with `npm run deploy` (not git-auto-deploy).

## What ships

| Path | Type | Purpose |
|------|------|---------|
| `radar/index.html` | Static | Marketing + signup landing page → `https://www.revforgehq.com/radar/` |
| `radar/welcome.html` | Static | Email-confirmation landing (success / error) |
| `functions/api/radar/signup.ts` | Pages Function | `POST` — validate, create account (pending), email a confirmation link |
| `functions/api/radar/verify.ts` | Pages Function | `GET` — confirm email, activate trial, queue first scan, notify owner |
| `functions/lib/radar.ts` | Lib | PBKDF2 hashing, signed verify tokens, validation, rate limits, email bodies |
| `functions/lib/env.ts` | Lib (edited) | Added `RADAR_TOKEN_SECRET`, `RADAR_FROM_EMAIL`, `PUBLIC_BASE_URL`, `requireRadarSecret()` |
| `scripts/sql/radar_schema.sql` | SQL | Neon tables: accounts, brands, prompts, competitors, scan_jobs, signup_events |
| `sitemap.xml` | Static (edited) | Added `/radar/` |

Reuses existing infra: `lib/db.ts` (Neon), `lib/postmark.ts` (email), `lib/scan-gate.ts`
(`isWorkEmail`, `hashIp`, `timingSafeEqual`), `lib/free-email-domains.ts` (blocks personal/disposable).

## Registration design (how info is managed & stored)

1. **Step 1–2 (client):** domain → auto-suggested prompts + competitors (editable chips). No PII yet.
2. **Step 3 → `POST /api/radar/signup`:**
   - Validates domain, **work email** (personal/disposable blocked), password ≥ 8.
   - **Rate-limited** by email (3/day) and IP-hash (8/hr) via `radar_signup_events`.
   - Password stored as **PBKDF2-SHA256** (210k iters, random 16-byte salt) — never plaintext.
   - Creates `radar_accounts` (status `pending_verification`, `trial_ends_at = now + 7d`) +
     `radar_brands` + `radar_tracked_prompts` + `radar_competitors`.
   - Emails a **signed, 24h confirmation link** (HMAC, stateless) via Postmark.
3. **Confirmation → `GET /api/radar/verify?token=…`:**
   - Verifies HMAC token → sets account `active`, `verified_at`.
   - Inserts a `radar_scan_jobs` row (`kind=first_scan`, `status=queued`) — idempotent on re-click.
   - Emails the **owner** (gaurav@revforgehq.com) so the Phase-0/1 pipeline can run the brand.
   - 302 → `/radar/welcome.html?status=ok`.

**Why double opt-in:** it gates expensive engine calls behind a confirmed human — the
free-tier abuse vector flagged as an open decision in the architecture doc (§17.6).

## One-time setup (before first deploy)

```bash
# 1. Apply the schema to Neon (revforgehq-demos). Load DATABASE_URL from .dev.vars
#    WITHOUT `source` (the URL contains & and ? which the shell mis-parses):
DATABASE_URL="$(grep -E '^DATABASE_URL=' .dev.vars | cut -d= -f2-)"
psql "$DATABASE_URL" -f scripts/sql/radar_schema.sql

# 2. Set the two NEW Worker secrets (DATABASE_URL / POSTMARK_* already exist):
printf '%s' "$(openssl rand -hex 32)"      | npx wrangler secret put RADAR_TOKEN_SECRET --name revforgehq-site
printf '%s' "https://www.revforgehq.com"   | npx wrangler secret put PUBLIC_BASE_URL    --name revforgehq-site
#    RADAR_TOKEN_SECRET = HMAC for verify links + IP hashing
#    PUBLIC_BASE_URL    = used to build the confirm link
#    RADAR_FROM_EMAIL   = optional; defaults to gaurav@revforgehq.com (verified Postmark sender)
```

Postmark sender must be a verified signature/domain (already set for scan-gate).

## Deploy

```bash
npm run deploy:check          # wrangler deploy --dry-run (full worker build sanity)
# Merge PR #2 (radar-launch → main), then deploy the Worker from main:
git checkout main && git pull && npm run deploy
```

> If a Workers Builds CI is connected to the GitHub repo, the merge/push deploys automatically
> and `npm run deploy` is unnecessary — check the Worker's deployment history after merging.

> The functions bundle was verified locally: `npx wrangler pages functions build` →
> "Compiled Worker successfully", with `api/radar/signup` + `api/radar/verify` in the output.

## Verify in production

```bash
curl -i https://www.revforgehq.com/radar/                      # 200, page loads
# Signup (use a real work email you can read):
curl -sX POST https://www.revforgehq.com/api/radar/signup \
  -H 'Content-Type: application/json' \
  -d '{"domain":"example.com","name":"Test User","email":"you@yourcompany.com","password":"trial1234","prompts":["best alternatives to example"],"competitors":["Acme"]}'
# → {"ok":true,"message":"Check your email to confirm your trial.",...}
# Click the emailed link → lands on /radar/welcome.html?status=ok ; account becomes active.
psql "$DATABASE_URL" -c "select email,status,plan,trial_ends_at from radar_accounts order by created_at desc limit 5;"
psql "$DATABASE_URL" -c "select brand_id,kind,status from radar_scan_jobs order by created_at desc limit 5;"
```

## Operating the queue (Phase 0/1)

The first scan is **queued**, not auto-run — there is no scan worker in this repo yet
(the scan pipeline is the local Python harness). On each verified signup the owner gets an
email; run the pipeline for that domain, then mark the job done:

```sql
UPDATE radar_scan_jobs SET status='done', finished_at=NOW() WHERE id='<job-id>';
```

When the Temporal/worker fleet from the architecture doc lands, point it at
`radar_scan_jobs WHERE status='queued'` — the schema seam is already in place.

## Future / not in this cut

- `radar.revforgehq.com` subdomain (architecture doc uses it) — currently served as a path;
  add a Worker custom domain/route later, no code change needed.
- Sign-in / session auth (the page has a "Sign in" link stub) — trial is verify-link based for now.
- Stripe billing at trial end; daily "report ready" + delta notifications (use existing `_scheduled.ts`).
- Cloudflare Turnstile on the signup form if bot signups appear despite rate limits.
