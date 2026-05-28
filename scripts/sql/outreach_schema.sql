-- RevForgeHQ — LinkedIn outreach message drafts
-- Apply after crm_schema.sql:
--   psql "$DATABASE_URL" -f scripts/sql/outreach_schema.sql

CREATE TABLE IF NOT EXISTS lead_outreach_messages (
    id              TEXT PRIMARY KEY,
    lead_id         TEXT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
    channel         TEXT NOT NULL DEFAULT 'linkedin',
    message_body    TEXT NOT NULL,
    company_context TEXT,
    workflow_area   TEXT,
    status          TEXT NOT NULL DEFAULT 'draft',
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_lead_id ON lead_outreach_messages (lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON lead_outreach_messages (status);
CREATE INDEX IF NOT EXISTS idx_outreach_updated_at ON lead_outreach_messages (updated_at);

ALTER TABLE crm_sync_runs ADD COLUMN IF NOT EXISTS outreach_upserted INT DEFAULT 0;

INSERT INTO crm_sync_state (key) VALUES ('outreach_to_sheet')
ON CONFLICT (key) DO NOTHING;
