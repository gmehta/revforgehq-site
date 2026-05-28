import type { Sql } from "./db.js";

export interface AccountRow {
  id: string;
  company_name: string;
  company_key: string;
  domain: string | null;
  segment: string | null;
  tier: number | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function listAccounts(sql: Sql): Promise<AccountRow[]> {
  return (await sql`
    SELECT id, company_name, company_key, domain, segment, tier, status, notes,
           created_at, updated_at
    FROM accounts
    ORDER BY id ASC
  `) as AccountRow[];
}

export interface LeadSyncRow {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  lead_source: string;
  outreach_status: string;
  gtm_tier: number | null;
  gtm_tier_reason: string | null;
  tier: number | null;
  score: number | null;
  updated_at: string;
  domain: string | null;
}

export async function listLeadsForSync(
  sql: Sql,
  watermark: string | null,
  full: boolean,
): Promise<LeadSyncRow[]> {
  if (full || !watermark) {
    return (await sql`
      SELECT l.id, l.full_name, l.first_name, l.last_name, l.company, l.title,
             l.email, l.linkedin_url, l.lead_source, l.outreach_status,
             l.gtm_tier, l.gtm_tier_reason, l.tier, l.score, l.updated_at,
             a.domain
      FROM leads l
      LEFT JOIN accounts a ON a.company_key = l.company_key
      ORDER BY l.id ASC
    `) as LeadSyncRow[];
  }

  return (await sql`
    SELECT l.id, l.full_name, l.first_name, l.last_name, l.company, l.title,
           l.email, l.linkedin_url, l.lead_source, l.outreach_status,
           l.gtm_tier, l.gtm_tier_reason, l.tier, l.score, l.updated_at,
           a.domain
    FROM leads l
    LEFT JOIN accounts a ON a.company_key = l.company_key
    WHERE l.updated_at > ${watermark}::timestamptz
    ORDER BY l.id ASC
  `) as LeadSyncRow[];
}

export interface SyncStateRow {
  key: string;
  last_success_at: string | null;
  last_lead_updated_at: string | null;
}

export async function getSyncState(sql: Sql, key: string): Promise<SyncStateRow | null> {
  const rows = (await sql`
    SELECT
      key,
      last_success_at,
      last_lead_updated_at::text AS last_lead_updated_at
    FROM crm_sync_state
    WHERE key = ${key}
    LIMIT 1
  `) as SyncStateRow[];
  return rows[0] ?? null;
}

export interface SyncRunSummary {
  id: number;
  run_type: string;
  started_at: string;
  finished_at: string | null;
  leads_upserted: number | null;
  accounts_upserted: number | null;
  outreach_upserted: number | null;
  errors: unknown;
}

export async function getLatestSyncRun(sql: Sql): Promise<SyncRunSummary | null> {
  const rows = (await sql`
    SELECT id, run_type, started_at, finished_at, leads_upserted, accounts_upserted,
           outreach_upserted, errors
    FROM crm_sync_runs
    ORDER BY id DESC
    LIMIT 1
  `) as SyncRunSummary[];
  return rows[0] ?? null;
}

export async function recordSyncRun(
  sql: Sql,
  input: {
    runType: string;
    leadsUpserted: number;
    accountsUpserted: number;
    outreachUpserted: number;
    errors: string[] | null;
    leadWatermark: string | null;
  },
): Promise<void> {
  await sql`
    INSERT INTO crm_sync_runs (
      run_type, finished_at, leads_upserted, accounts_upserted, outreach_upserted, errors
    )
    VALUES (
      ${input.runType},
      NOW(),
      ${input.leadsUpserted},
      ${input.accountsUpserted},
      ${input.outreachUpserted},
      ${input.errors ? JSON.stringify(input.errors) : null}::jsonb
    )
  `;

  if (input.leadWatermark) {
    await sql`
      INSERT INTO crm_sync_state (key, last_success_at, last_lead_updated_at)
      VALUES ('leads_to_sheet', NOW(), ${input.leadWatermark}::timestamptz)
      ON CONFLICT (key) DO UPDATE SET
        last_success_at = NOW(),
        last_lead_updated_at = GREATEST(
          COALESCE(crm_sync_state.last_lead_updated_at, 'epoch'::timestamptz),
          EXCLUDED.last_lead_updated_at
        )
    `;
  }

  await sql`
    INSERT INTO crm_sync_state (key, last_success_at)
    VALUES ('accounts_to_sheet', NOW())
    ON CONFLICT (key) DO UPDATE SET last_success_at = NOW()
  `;

  await sql`
    INSERT INTO crm_sync_state (key, last_success_at)
    VALUES ('outreach_to_sheet', NOW())
    ON CONFLICT (key) DO UPDATE SET last_success_at = NOW()
  `;
}
