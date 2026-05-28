-- RevForgeHQ — account news enrichment (daily Cloudflare agent)
-- Apply after crm_schema.sql:
--   psql "$DATABASE_URL" -f scripts/sql/account_news_schema.sql

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS news_events JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_accounts_news_events ON accounts USING GIN (news_events);

CREATE TABLE IF NOT EXISTS account_news_runs (
    id                SERIAL PRIMARY KEY,
    started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at       TIMESTAMPTZ,
    articles_fetched  INT DEFAULT 0,
    accounts_enriched INT DEFAULT 0,
    events_added      INT DEFAULT 0,
    errors            JSONB
);
