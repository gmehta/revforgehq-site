-- RevForgeHQ GTM — leads + outbound email send log
-- Apply: psql "$DATABASE_URL" -f scripts/sql/leads_schema.sql

CREATE TABLE IF NOT EXISTS leads (
    id                  TEXT PRIMARY KEY,
    full_name           TEXT,
    first_name          TEXT,
    last_name           TEXT,
    company             TEXT,
    company_key         TEXT,
    title               TEXT,
    tier                SMALLINT,
    tier_reason         TEXT,
    score               SMALLINT,
    is_decision_maker   BOOLEAN DEFAULT FALSE,
    dm_reason           TEXT,
    email               TEXT,
    email_status        TEXT,
    email_verified_at   TIMESTAMPTZ,
    lead_source         TEXT NOT NULL DEFAULT 'adobe_summit',
    linkedin_url        TEXT,
    outreach_status     TEXT NOT NULL DEFAULT 'new',
    last_contacted_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_tier ON leads (tier);
CREATE INDEX IF NOT EXISTS idx_leads_outreach_status ON leads (outreach_status);
CREATE INDEX IF NOT EXISTS idx_leads_company_key ON leads (company_key);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email) WHERE email IS NOT NULL;

-- Migration for existing databases (idempotent; run before source/url indexes)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source TEXT NOT NULL DEFAULT 'adobe_summit';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_source ON leads (lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_linkedin_url ON leads (linkedin_url) WHERE linkedin_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS lead_email_sends (
    id                  SERIAL PRIMARY KEY,
    lead_id             TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    postmark_message_id TEXT,
    from_email          TEXT NOT NULL,
    to_email            TEXT NOT NULL,
    subject             TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'submitted',
    error               TEXT,
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_email_sends_lead ON lead_email_sends (lead_id, sent_at DESC);
