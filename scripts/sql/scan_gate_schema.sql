-- RevForgeHQ — scan report gate (OTP + access log)
-- Apply: psql "$DATABASE_URL" -f scripts/sql/scan_gate_schema.sql

CREATE TABLE IF NOT EXISTS scan_gate_otps (
    id          SERIAL PRIMARY KEY,
    email       TEXT NOT NULL,
    scan_slug   TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scan_gate_access (
    id                  SERIAL PRIMARY KEY,
    email               TEXT,
    scan_slug           TEXT NOT NULL,
    unlock_method       TEXT NOT NULL,
    postmark_message_id TEXT,
    unlocked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_hash             TEXT,
    user_agent          TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_gate_otps_lookup
    ON scan_gate_otps (email, scan_slug, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_scan_gate_access_email
    ON scan_gate_access (email) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scan_gate_access_slug
    ON scan_gate_access (scan_slug);

CREATE INDEX IF NOT EXISTS idx_scan_gate_otps_created
    ON scan_gate_otps (email, scan_slug, created_at DESC);
