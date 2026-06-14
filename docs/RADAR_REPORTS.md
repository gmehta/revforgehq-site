# RevForge Radar — Report Pipeline (Phase 0/1 of the AEO Daily Reporting Platform)

How a Radar signup turns into a generated AI-visibility report, and how it maps to
`RevForgeHQ AEO Daily Reporting Platform — System Architecture`.

## The flow (signup → report)

```
1. Signup        POST /api/radar/signup  → radar_accounts (status=pending_verification, plan=free|pro_trial)
                                            + brand/prompts/competitors.  NO scan yet.
2. Confirm email GET  /api/radar/verify   → account status=active, INSERT radar_scan_jobs (kind=first_scan, status=queued)
3. Generate      revforge-scan/radar_runner.py  (OFFLINE, not in the Worker)
                   - reads queued jobs for ACTIVE accounts only  ← report is never made before email confirm
                   - builds prompts.json from the tenant's stored config
                   - tier-aware scan (Free=1 engine/15 prompts, Pro=4 engines/50 prompts)
                   - reuses make_reports.build() to render the report HTML  (same generator as fabletics/bill)
                   - writes radar_reports (html + random view_token), marks job done
4. View          GET /api/radar/report?id=<uuid>&t=<view_token>  → serves the report HTML (gated, noindex)
```

**Report is only generated after email confirmation** — the runner's query joins on
`radar_accounts.status='active'`, and jobs are only created by `/api/radar/verify`. Verified live:
the runner returns "No queued jobs for verified accounts" until an account is activated.

## Where the pieces live

| Piece | Location | Notes |
|-------|----------|-------|
| Signup / verify / suggest / report viewer | `functions/api/radar/*.ts` (this repo → Worker) | deployed |
| Report DB | Neon: `radar_reports` (+ `radar_scan_jobs.report_id`, `radar_brands.last_report_id`) | `scripts/sql/radar_reports_schema.sql` |
| **Report runner** | **`RevForgeHQ/revforge-scan/radar_runner.py`** (NOT in this repo) | lives with `scan.py`/`make_reports.py`, which it reuses — same place the offline scan pipeline already runs (engine APIs are blocked in the Worker / sandbox, per the architecture) |
| Report generator | `revforge-scan/make_reports.py` (`build()`) | reused verbatim — the generic per-company report. `make_exec_report.py` is the bespoke fabletics-grade version. |

## Running the runner

```bash
cd RevForgeHQ/revforge-scan
export DATABASE_URL="$(grep -E '^DATABASE_URL=' /path/to/RevForgeHD/.dev.vars | cut -d= -f2-)"
export PUBLIC_BASE_URL="https://www.revforgehq.com"

# Generate reports for all queued+verified jobs WITHOUT spending on engine APIs (synthetic data):
python3 radar_runner.py --mock --limit 20

# Real scan (costs money; needs OPENAI/PERPLEXITY/GEMINI/SERP keys in revforge-scan/.env):
python3 radar_runner.py --limit 20

# One job, or a self-test that needs no DB/API:
python3 radar_runner.py --job <uuid>
python3 radar_runner.py --selftest --tier pro_trial   # writes /tmp/radar_selftest_report.html
```

Tier config (from `radar_accounts.plan`):
- **free** → engines `[openai]`, 15 prompts, weekly cadence
- **pro_trial / pro / scale** → engines `[openai, perplexity, gemini, aioverview]`, 50 prompts, daily cadence

## Verified end-to-end (2026-06-14, mock mode)

| Plan | Brand | engines | prompts | mention rate | report | viewer |
|------|-------|---------|---------|--------------|--------|--------|
| pro_trial | Gymshark | 4 | 5 | 45.0% | done | 200, gated |
| free | Notion | 1 | 3 | 66.7% | done | 200, gated |

Bad view token → 404. Pre-verification runner run → 0 reports.

## Mapping to the architecture doc

Implemented (Phase 0/1 seam): tenant config → job → scan → report → gated viewer, tier-aware,
post-verification, reusing the existing scan/report pipeline. The four non-negotiable seams hold:
tenant_id everywhere, immutable raw vs derived (raw scan-results.json → rendered report), and
versioned config (effective-dated prompts/competitors).

Deferred (Phase 2, build when load demands): Temporal orchestration, the global rate broker,
ClickHouse trends, autoscaled worker fleet, cross-tenant discover-prompt caching. Today the runner is
a single process; it's the seam those slot into.

## Automation (minimal path — built 2026-06-14)

The runner now schedules itself. One cron tick does both **enqueue** (due jobs per tenant) and
**process** (generate + email), so a new signup's first report lands within the tick interval and
each tenant's next report is enqueued once their local morning arrives.

```bash
# every ~30 min (the cron entrypoint; --real = paid scans, default mock):
revforge-scan/radar_cron.sh --real
#   → python3 radar_runner.py --schedule --limit 200 --max-real 200
```

Scheduler modes:
- `radar_runner.py --enqueue`   → insert due daily/weekly jobs, exit
- `radar_runner.py --schedule`  → enqueue, then process the queue (use in cron)
- `--max-real N`                → cost guard: cap paid scans per run (default 200)

**Cadence rules** (evaluated in each tenant's `radar_brands.timezone`, gated by `report_ready_by`):
- **First report** = the `first_scan` job from `/api/radar/verify` (on signup) — picked up next tick.
- **Pro/daily**: at most one report per local calendar day, only after the local morning target.
  Because the first report already sets `last_report_at` to the signup day, the **next** daily report
  is enqueued the **following local morning** — never a second one on signup day.
- **Free/weekly**: at most one report per 7 days.
- Pro is gated to live trials (`trial_ends_at > now()`), so expired trials stop scanning (no spend).
- Idempotent: the date/time gate + a NOT-EXISTS guard mean re-running never duplicates jobs.

**Report-ready email**: after each report the runner calls `POST /api/radar/notify`
(Bearer `RADAR_RUNNER_KEY`); the Worker (which holds the Postmark token) emails the account the link.
Set `RADAR_RUNNER_KEY` as a Worker secret **and** in `revforge-scan/.env`.

**Scheduling host**: `com.revforgehq.radar.plist` (launchd, every 30 min) is provided for macOS, but a
laptop that sleeps misses ticks. For a real paid campaign, run `radar_cron.sh --real` on an always-on
host, or move enqueueing into the Worker cron (`functions/_scheduled.ts`) so scheduling is host-independent
and the host only needs to process the durable queue.

### Cadence verified E2E (2026-06-14, mock)

| Test | Scenario | Result |
|------|----------|--------|
| Signup day (report already today) | enqueue 0 | ✅ |
| Next morning (last report yesterday) | 1 Pro daily + email | ✅ |
| Re-run same day | 0 (no triple) | ✅ |
| Before `report_ready_by` | 0 (waits for AM) | ✅ |
| After `report_ready_by` | 1 daily | ✅ |
| Free 8 days since last | 1 weekly + email | ✅ |
| Free 3 days since last | 0 | ✅ |

### Will it handle 100 trialers × daily × 7 days?

Yes, with this automation, **if** real mode is enabled with engine keys + budget. The enqueue is a
single set-based SQL insert (handles all due tenants at once); processing loops with the cost guard.
100 Pro tenants = ~20K engine calls/day (~0.3/s spread) — modest; no rate broker needed at this scale.
Budget ~$625/day unoptimized. The remaining real-campaign needs: an always-on host, real-scan smoke
test (the real `scan.py` path is implemented but the E2E above used `--mock`), and a failure alert.

## Open follow-ups

- ✅ ~~"Report ready" email~~ — done via `/api/radar/notify`.
- ✅ ~~Scheduling~~ — done via `radar_runner.py --schedule` + `radar_cron.sh` (host cron / launchd).
- **Real-scan smoke test**: the real `scan.py` path is wired but the E2E above used `--mock`. Run one
  `radar_runner.py --job <id>` (no `--mock`) against a single tenant before a paid campaign.
- **Always-on host + failure alert**: a sleeping laptop misses ticks; add a P1 alert when a job goes `failed`.
- **Free-tier report wording**: `make_reports` prose names all four engines even when only one was
  scanned (per-engine KPIs are correct). Cosmetic.
- **Cost optimizations** (doc §16.4): mini-models for daily tracking, cross-tenant discover caching,
  batch API — cut spend 60–70%; not built.
