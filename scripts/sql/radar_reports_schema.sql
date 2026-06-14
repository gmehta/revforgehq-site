-- RevForge Radar — generated reports (written by the offline runner, served by the Worker)
-- Apply: psql "$DATABASE_URL" -f scripts/sql/radar_reports_schema.sql
--
-- The offline report runner (revforge-scan/radar_runner.py) reads queued
-- radar_scan_jobs, runs the scan (or mock), builds the report HTML, and writes
-- a row here. The Worker serves it via /api/radar/report behind a signed token.

CREATE TABLE IF NOT EXISTS radar_reports (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id      UUID NOT NULL REFERENCES radar_brands(id) ON DELETE CASCADE,
    account_id    UUID NOT NULL REFERENCES radar_accounts(id) ON DELETE CASCADE,
    job_id        UUID REFERENCES radar_scan_jobs(id) ON DELETE SET NULL,
    kind          TEXT NOT NULL DEFAULT 'first_scan',   -- first_scan | daily | weekly
    tier          TEXT,                                  -- free | pro_trial | pro
    title         TEXT,
    html          TEXT NOT NULL,                         -- the rendered report
    summary       JSONB,                                 -- scan metrics (rates, SoV, etc.)
    mention_rate  NUMERIC,
    engines       TEXT[],                                -- engines actually scanned
    prompt_count  INT,
    is_mock       BOOLEAN NOT NULL DEFAULT FALSE,        -- true = synthetic (no engine spend)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_radar_reports_brand   ON radar_reports (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_reports_account ON radar_reports (account_id, created_at DESC);

-- Link a job to the report it produced.
ALTER TABLE radar_scan_jobs ADD COLUMN IF NOT EXISTS report_id UUID REFERENCES radar_reports(id) ON DELETE SET NULL;
-- Track each brand's latest report for quick "report ready" lookups.
ALTER TABLE radar_brands ADD COLUMN IF NOT EXISTS last_report_id UUID REFERENCES radar_reports(id) ON DELETE SET NULL;
ALTER TABLE radar_brands ADD COLUMN IF NOT EXISTS last_report_at TIMESTAMPTZ;
