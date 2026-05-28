-- RevForgeHQ — account tech stack enrichment (one-time batch)
-- Apply after account_news_schema.sql:
--   psql "$DATABASE_URL" -f scripts/sql/account_stack_schema.sql

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tech_stack JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_accounts_tech_stack ON accounts USING GIN (tech_stack);

CREATE TABLE IF NOT EXISTS account_stack_runs (
    id                 SERIAL PRIMARY KEY,
    started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at        TIMESTAMPTZ,
    accounts_processed INT DEFAULT 0,
    accounts_enriched  INT DEFAULT 0,
    errors             JSONB
);
