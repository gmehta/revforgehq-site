-- AgenticMOps Neon Postgres schema — Audience Agent synthetic / eval substrate
-- Apply: psql "$DATABASE_URL" -f scripts/sql/neon_schema.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Campaigns ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaigns (
    id                  TEXT PRIMARY KEY,
    elm_id              TEXT UNIQUE,
    name                TEXT,
    business_unit       TEXT,
    campaign_goal       TEXT,
    campaign_type       TEXT,
    products            TEXT[] DEFAULT '{}',
    channels            TEXT[] DEFAULT '{}',
    sot_main_audience   TEXT,
    status              TEXT DEFAULT 'planning',
    target_launch_date  DATE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_goal_bu ON campaigns (campaign_goal, business_unit);
CREATE INDEX IF NOT EXISTS idx_campaigns_elm ON campaigns (elm_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_sot_fts ON campaigns USING gin (to_tsvector('english', coalesce(sot_main_audience, '')));

-- ── Audience specs (destination system outcomes) ─────────────────────────────

CREATE TABLE IF NOT EXISTS audience_specs (
    id                  TEXT PRIMARY KEY,
    campaign_id         TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    source              TEXT NOT NULL DEFAULT 'segment_cdp',
    audience_name       TEXT,
    segment_audience_id TEXT,
    segment_audience_key TEXT,
    attributes          TEXT[] DEFAULT '{}',
    audience_criteria   TEXT,
    size_estimate       BIGINT,
    platform            TEXT DEFAULT 'segment_cdp',
    status              TEXT DEFAULT 'built',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audience_specs_campaign ON audience_specs (campaign_id);
CREATE INDEX IF NOT EXISTS idx_audience_specs_source ON audience_specs (source);
CREATE INDEX IF NOT EXISTS idx_audience_specs_key ON audience_specs (segment_audience_key);
CREATE INDEX IF NOT EXISTS idx_audience_specs_criteria_fts ON audience_specs USING gin (to_tsvector('english', coalesce(audience_criteria, '')));

-- ── Parsed NL criteria per campaign ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audience_criteria (
    id                  SERIAL PRIMARY KEY,
    campaign_id         TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    criterion_text      TEXT NOT NULL,
    concept_keywords    TEXT[] DEFAULT '{}',
    criterion_type      TEXT DEFAULT 'inclusion',
    sort_order          INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_audience_criteria_campaign ON audience_criteria (campaign_id);

-- ── Attribute mappings (SOT → system trait bridge) ───────────────────────────

CREATE TABLE IF NOT EXISTS attribute_mappings (
    id                  TEXT PRIMARY KEY,
    spec_name           TEXT NOT NULL,
    system_name         TEXT NOT NULL,
    system              TEXT NOT NULL DEFAULT 'segment_cdp',
    data_type           TEXT,
    nl_operator         TEXT,
    status              TEXT DEFAULT 'active',
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attribute_mappings_system ON attribute_mappings (system, status);

-- ── NL phrases (replaces Neo4j full-text index) ──────────────────────────────

CREATE TABLE IF NOT EXISTS nl_phrases (
    id                  SERIAL PRIMARY KEY,
    mapping_id          TEXT NOT NULL REFERENCES attribute_mappings(id) ON DELETE CASCADE,
    phrase              TEXT NOT NULL,
    validated_by_campaign_ids TEXT[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_nl_phrases_mapping ON nl_phrases (mapping_id);
CREATE INDEX IF NOT EXISTS idx_nl_phrases_trgm ON nl_phrases USING gin (phrase gin_trgm_ops);

-- ── Campaign connections (graph edges as rows) ───────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_connections (
    id                  SERIAL PRIMARY KEY,
    from_campaign_id    TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    to_campaign_id      TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    connection_type     TEXT NOT NULL,
    metadata            JSONB DEFAULT '{}',
    UNIQUE (from_campaign_id, to_campaign_id, connection_type)
);

CREATE INDEX IF NOT EXISTS idx_campaign_conn_from ON campaign_connections (from_campaign_id, connection_type);
CREATE INDEX IF NOT EXISTS idx_campaign_conn_to ON campaign_connections (to_campaign_id, connection_type);

-- ── Ground truth manifests (expected agent outcomes) ─────────────────────────

CREATE TABLE IF NOT EXISTS ground_truth_manifests (
    campaign_id         TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    manifest_json       JSONB NOT NULL DEFAULT '{}',
    segment_expression  TEXT,
    expected_size       BIGINT,
    resolution_summary  JSONB DEFAULT '{}',
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Segment trait catalog ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS segment_traits (
    trait_key           TEXT PRIMARY KEY,
    usage_count         INTEGER DEFAULT 0,
    sample_operators    TEXT[] DEFAULT '{}'
);

-- ── Audience destinations (optional downstream activation context) ───────────

CREATE TABLE IF NOT EXISTS audience_destinations (
    id                  SERIAL PRIMARY KEY,
    audience_spec_id    TEXT NOT NULL REFERENCES audience_specs(id) ON DELETE CASCADE,
    destination_name    TEXT,
    destination_id      TEXT,
    destination_type    TEXT,
    connection_enabled  BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_audience_dest_spec ON audience_destinations (audience_spec_id);

-- ── Seed log ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS neon_seed_log (
    id              SERIAL PRIMARY KEY,
    phase           TEXT NOT NULL,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    records_count   INTEGER,
    notes           TEXT
);
