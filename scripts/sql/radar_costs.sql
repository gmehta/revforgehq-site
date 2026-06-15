-- RevForge Radar — per-report LLM cost attribution.
-- Apply: psql "$DATABASE_URL" -f scripts/sql/radar_costs.sql
--
-- cost_usd is the modeled engine cost of producing the report, locked at
-- generation time (prompt_count × sum of per-engine list prices). is_mock
-- distinguishes ACTUAL spend (real scans) from MODELED cost (test/mock scans).
-- Per-engine list prices (architecture §16.2, June 2026): openai .038,
-- perplexity .029, gemini .028, aioverview .030 per call.

ALTER TABLE radar_reports ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10,4);

-- Backfill existing reports from their stored engines + prompt_count.
UPDATE radar_reports r
SET cost_usd = ROUND(
  COALESCE(prompt_count, 0) * COALESCE((
    SELECT SUM(CASE e
      WHEN 'openai'     THEN 0.038
      WHEN 'perplexity' THEN 0.029
      WHEN 'gemini'     THEN 0.028
      WHEN 'aioverview' THEN 0.030
      ELSE 0 END)
    FROM unnest(r.engines) e), 0), 4)
WHERE cost_usd IS NULL;

CREATE INDEX IF NOT EXISTS idx_radar_reports_cost ON radar_reports (created_at DESC) INCLUDE (cost_usd, is_mock);
