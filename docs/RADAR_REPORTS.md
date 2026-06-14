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

## Open follow-ups

- **"Report ready" email**: the runner prints/stores the report URL but doesn't yet email it. Add a
  notify step (Postmark) or a `/api/radar/notify` call so the customer is emailed when their report lands.
- **Scheduling**: wire the runner to a cron (daily for Pro, weekly for Free) — e.g. the repo's
  `functions/_scheduled.ts` could enqueue daily/weekly jobs; a host cron runs `radar_runner.py`.
- **Free-tier report wording**: `make_reports` prose names all four engines even when only one was
  scanned (the per-engine KPIs are correct). Cosmetic; tweak if it matters for free-tier polish.
- **Real scans** cost ~$0.12/prompt-engine — keep `--mock` for tests; gate real runs behind the rate broker when built.
