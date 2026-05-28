# RevForgeHQ GTM — Leads in Neon + Postmark

Operational guide for lead storage and outbound email. Code lives in the same repo as the marketing site and deploys to Cloudflare Pages on push to `main`.

## Architecture

- **Leads:** Neon Postgres (`leads` table) — source of truth, all sources unified
- **Accounts:** Neon Postgres (`accounts` table) — target companies; see **[CRM.md](CRM.md)**
- **GTM backup:** Google Sheet synced daily from Neon (upsert only)
- **Lead sources:** `adobe_summit` (scored MarTech leads), `linkedin_varun` (partner LinkedIn export)
- **Email send:** Cloudflare Pages Functions → Postmark API
- **Enrichment:** Anymail Finder (`scripts/enrich_leads_anymail.py`) → merge on re-seed
- **Raw files:** `scripts/input/` or local xlsx (gitignored, PII) — backup only after Neon seed

## Lead sources

| `lead_source` | File | Rows |
|---------------|------|------|
| `adobe_summit` | `adobe_summit_tiered.xlsx` Tab 1 (+ Tab 2 emails) or `scripts/input/leads.csv` | 3,471 |
| `linkedin_varun` | `Connections.xlsx` (Varun's LinkedIn export) | ~29,205 |

LinkedIn rows use `id` format `li_<linkedin_slug>` (e.g. `li_jarrodmjohnson`) and store profile URL in `linkedin_url`.

## One-time setup

### 1. Neon schema

```bash
export DATABASE_URL='postgresql://...'   # Neon pooled connection string
psql "$DATABASE_URL" -f scripts/sql/leads_schema.sql
psql "$DATABASE_URL" -f scripts/sql/crm_schema.sql
```

CRM setup (accounts import, sheet sync): **[CRM.md](CRM.md)**

### 2. Seed leads

```bash
pip install -r scripts/requirements-neon.txt

# Adobe Summit (xlsx with scored leads + enrichment tab)
python scripts/seed_leads.py --source adobe_summit --dry-run \
  --input ~/Downloads/adobe_summit_tiered.xlsx
python scripts/seed_leads.py --source adobe_summit \
  --input ~/Downloads/adobe_summit_tiered.xlsx

# Varun LinkedIn connections
python scripts/seed_leads.py --source linkedin_varun --dry-run \
  --input ~/Downloads/Connections.xlsx
python scripts/seed_leads.py --source linkedin_varun \
  --input ~/Downloads/Connections.xlsx

# Legacy CSV (same as adobe_summit source)
python scripts/seed_leads.py --source adobe_summit
```

Re-run after enrichment to backfill emails:

```bash
python scripts/seed_leads.py --source adobe_summit --input ~/Downloads/adobe_summit_tiered.xlsx
```

Verify counts:

```sql
SELECT lead_source, COUNT(*) FROM leads GROUP BY lead_source;
SELECT COUNT(*) FROM leads WHERE email IS NOT NULL;
-- Expected: adobe_summit 3471, linkedin_varun ~29205, ~693 total with email
```

### 3. Postmark sender

1. Create a Postmark **Server** and copy the **Server API token**
2. Verify your sending domain or sender signature (e.g. `you@revforgehq.com`)
3. Add env vars locally and in Cloudflare Pages:

| Variable | Purpose |
|----------|---------|
| `POSTMARK_SERVER_TOKEN` | Postmark Server API token |
| `POSTMARK_FROM_EMAIL` | Verified sender address |
| `LEADS_API_KEY` | Bearer token to protect `/api/leads/*` |

Local: copy `.dev.vars.example` → `.dev.vars` and fill all vars.

Cloudflare: **Workers & Pages** → project → **Settings** → **Environment variables** (production + preview).

Generate a strong API key:

```bash
openssl rand -hex 32
```

## API reference

All endpoints require `Authorization: Bearer <LEADS_API_KEY>`.

### List leads

```bash
curl -H "Authorization: Bearer $LEADS_API_KEY" \
  "https://www.revforgehq.com/api/leads?tier=1&has_email=true&status=new&limit=10"
```

Query params: `tier`, `has_email=true`, `status` (`new`|`sent`|`bounced`|`replied`), `source` (`adobe_summit`|`linkedin_varun`), `limit` (max 200), `offset`.

```bash
# Tier 1 Adobe Summit leads with email
curl -H "Authorization: Bearer $LEADS_API_KEY" \
  "https://www.revforgehq.com/api/leads?source=adobe_summit&tier=1&has_email=true&status=new&limit=10"

# LinkedIn connections with email
curl -H "Authorization: Bearer $LEADS_API_KEY" \
  "https://www.revforgehq.com/api/leads?source=linkedin_varun&has_email=true&limit=10"
```

### Get one lead

```bash
curl -H "Authorization: Bearer $LEADS_API_KEY" \
  "https://www.revforgehq.com/api/leads/2132"
```

Returns lead + recent sends from `lead_email_sends`.

### Send email

```bash
curl -X POST -H "Authorization: Bearer $LEADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"subject":"Quick question on your MarTech stack","textBody":"Hi Marisa, ..."}' \
  "https://www.revforgehq.com/api/leads/2132/send"
```

Optional: `htmlBody`, `dryRun: true` (preview without sending).

## LinkedIn outreach (Varun tier 1–3)

343 `linkedin_varun` contacts in GTM tiers 1–3 have warm LinkedIn draft messages in `lead_outreach_messages`. Generation uses Cloudflare Workers AI plus company context from the account news stack (Neon `news_events`, NewsAPI, Google News RSS).

```bash
# Apply schema (once)
psql "$DATABASE_URL" -f scripts/sql/outreach_schema.sql

# Generate all pending drafts
python scripts/generate_linkedin_outreach.py

# Push to Google Sheet Outreach tab
python scripts/sync_crm_to_sheet.py --outreach-only
```

Review drafts in the **Outreach** sheet tab before sending on LinkedIn. Join key: `Lead ID` = `leads.id`.

## Cursor workflow

1. List Tier 1 leads with email: `GET /api/leads?tier=1&has_email=true&status=new`
2. Load context: `GET /api/leads/:id`
3. Draft personalized copy in Cursor
4. Send: `POST /api/leads/:id/send` with `subject` + `textBody`
5. Use `dryRun: true` first to verify recipient and content

Local dev base URL: `http://localhost:8788` (`npm run dev`).

## Recovery (new machine)

1. Clone `github.com/gmehta/revforgehq-site` (keep repo **private**)
2. Confirm production API: `curl https://www.revforgehq.com/api/health`
3. Retrieve secrets from Cloudflare dashboard or password manager
4. Verify Neon: `curl https://www.revforgehq.com/api/db/ping` — check `leads` count
5. If Neon empty: restore `scripts/input/leads.csv` from backup → `python scripts/seed_leads.py`
6. Test send with `dryRun: true`

## What is not in git

| Asset | Location |
|-------|----------|
| Lead CSV / xlsx | `scripts/input/` (gitignored) |
| Enrichment outputs | `scripts/output/leads_*` (gitignored) |
| Secrets | `.env`, `.dev.vars` (gitignored) |
| Lead data (primary) | Neon Postgres |

## HubSpot

HubSpot import was removed. Leads and send history live in Neon only.
