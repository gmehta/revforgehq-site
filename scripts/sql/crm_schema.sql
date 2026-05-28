-- RevForgeHQ CRM — accounts + sheet sync metadata
-- Apply after leads_schema.sql:
--   psql "$DATABASE_URL" -f scripts/sql/crm_schema.sql

CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT PRIMARY KEY,
    company_name    TEXT NOT NULL,
    company_key     TEXT NOT NULL UNIQUE,
    domain          TEXT,
    segment         TEXT,
    tier            SMALLINT,
    status          TEXT,
    notes           TEXT,
    extra           JSONB NOT NULL DEFAULT '{}',
    news_events     JSONB NOT NULL DEFAULT '[]',
    tech_stack      JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_company_key ON accounts (company_key);
CREATE INDEX IF NOT EXISTS idx_accounts_segment ON accounts (segment);
CREATE INDEX IF NOT EXISTS idx_accounts_tier ON accounts (tier);
CREATE INDEX IF NOT EXISTS idx_accounts_news_events ON accounts USING GIN (news_events);
CREATE INDEX IF NOT EXISTS idx_accounts_tech_stack ON accounts USING GIN (tech_stack);

CREATE TABLE IF NOT EXISTS account_stack_runs (
    id                 SERIAL PRIMARY KEY,
    started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at        TIMESTAMPTZ,
    accounts_processed INT DEFAULT 0,
    accounts_enriched  INT DEFAULT 0,
    errors             JSONB
);

CREATE TABLE IF NOT EXISTS account_news_runs (
    id                SERIAL PRIMARY KEY,
    started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at       TIMESTAMPTZ,
    articles_fetched  INT DEFAULT 0,
    accounts_enriched INT DEFAULT 0,
    events_added      INT DEFAULT 0,
    errors            JSONB
);

CREATE TABLE IF NOT EXISTS crm_sync_runs (
    id                SERIAL PRIMARY KEY,
    run_type          TEXT NOT NULL,
    started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at       TIMESTAMPTZ,
    leads_upserted    INT DEFAULT 0,
    accounts_upserted INT DEFAULT 0,
    errors            JSONB
);

CREATE TABLE IF NOT EXISTS crm_sync_state (
    key                  TEXT PRIMARY KEY,
    last_success_at      TIMESTAMPTZ,
    last_lead_updated_at TIMESTAMPTZ
);

INSERT INTO crm_sync_state (key) VALUES ('leads_to_sheet')
ON CONFLICT (key) DO NOTHING;

INSERT INTO crm_sync_state (key) VALUES ('accounts_to_sheet')
ON CONFLICT (key) DO NOTHING;

-- GTM tier columns for leads (used by sheet sync)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gtm_tier SMALLINT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gtm_tier_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_gtm_tier ON leads (gtm_tier);
CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads (updated_at);
