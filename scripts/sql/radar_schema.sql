-- RevForge Radar — self-serve trial signup & registration
-- Apply: psql "$DATABASE_URL" -f scripts/sql/radar_schema.sql
--
-- Design notes:
--   * Multi-tenant seam: every brand/prompt/competitor row carries a brand_id
--     that traces back to an account; account_id is the future sharding key.
--   * Passwords are PBKDF2-SHA256 (salt + hash stored separately, never plaintext).
--   * Signups are email-verified (double opt-in) before any scan is enqueued —
--     this gates expensive engine calls behind a confirmed human (abuse control).
--   * Prompts/competitors are effective-dated (created_at + active) so the trend
--     line can annotate config changes instead of misreading them as real swings.

-- ---------------------------------------------------------------------------
-- Accounts (one per signing-up user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS radar_accounts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email             TEXT NOT NULL UNIQUE,
    full_name         TEXT NOT NULL,
    password_hash     TEXT NOT NULL,         -- PBKDF2-SHA256, base64url
    password_salt     TEXT NOT NULL,         -- random 16 bytes, base64url
    plan              TEXT NOT NULL DEFAULT 'pro_trial',  -- pro_trial | pro | free | scale
    status            TEXT NOT NULL DEFAULT 'pending_verification', -- pending_verification | active | suspended | churned
    trial_started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_ends_at     TIMESTAMPTZ NOT NULL,  -- trial_started_at + 7 days
    verified_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signup_ip_hash    TEXT,
    signup_user_agent TEXT
);

-- ---------------------------------------------------------------------------
-- Brands (a tracked domain). One per account at launch; schema allows many.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS radar_brands (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES radar_accounts(id) ON DELETE CASCADE,
    domain          TEXT NOT NULL,
    brand_name      TEXT NOT NULL,
    timezone        TEXT NOT NULL DEFAULT 'America/New_York',
    report_ready_by TIME NOT NULL DEFAULT '06:00',  -- local AM deadline (SLA)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Tracked prompts (effective-dated)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS radar_tracked_prompts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id    UUID NOT NULL REFERENCES radar_brands(id) ON DELETE CASCADE,
    prompt_text TEXT NOT NULL,
    stage       TEXT NOT NULL DEFAULT 'discover', -- discover | compare | validate | branded
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Tracked competitors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS radar_competitors (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          UUID NOT NULL REFERENCES radar_brands(id) ON DELETE CASCADE,
    competitor_name   TEXT NOT NULL,
    competitor_domain TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Scan jobs — the first scan is queued on verification; a worker (or the
-- current Python pipeline) picks up status='queued' rows.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS radar_scan_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id      UUID NOT NULL REFERENCES radar_brands(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL DEFAULT 'first_scan', -- first_scan | daily | weekly
    status        TEXT NOT NULL DEFAULT 'queued',     -- queued | running | done | failed
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Signup events — audit trail + rate-limit source (mirrors scan_gate_access)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS radar_signup_events (
    id          SERIAL PRIMARY KEY,
    email       TEXT,
    event       TEXT NOT NULL,  -- signup_requested | verification_sent | verified | resend | blocked
    detail      TEXT,
    ip_hash     TEXT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_radar_brands_account     ON radar_brands (account_id);
CREATE INDEX IF NOT EXISTS idx_radar_prompts_brand      ON radar_tracked_prompts (brand_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_radar_competitors_brand  ON radar_competitors (brand_id);
CREATE INDEX IF NOT EXISTS idx_radar_scan_jobs_status   ON radar_scan_jobs (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_radar_signup_email_time  ON radar_signup_events (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_signup_ip_time     ON radar_signup_events (ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;
