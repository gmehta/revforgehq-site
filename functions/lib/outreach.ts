import type { Sql } from "./db.js";

export interface OutreachLeadRow {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  company_key: string | null;
  title: string | null;
  gtm_tier: number | null;
  gtm_tier_reason: string | null;
  linkedin_url: string | null;
  domain: string | null;
  segment: string | null;
}

export interface OutreachMessageRow {
  id: string;
  lead_id: string;
  channel: string;
  message_body: string;
  company_context: string | null;
  workflow_area: string | null;
  status: string;
  generated_at: string;
  updated_at: string;
}

export interface OutreachSyncRow {
  lead_id: string;
  full_name: string | null;
  company: string | null;
  title: string | null;
  gtm_tier: number | null;
  linkedin_url: string | null;
  channel: string;
  message_body: string;
  workflow_area: string | null;
  company_context: string | null;
  status: string;
  updated_at: string;
}


export async function listOutreachCohort(sql: Sql, limit?: number): Promise<OutreachLeadRow[]> {
  if (limit != null) {
    return (await sql`
      SELECT l.id, l.full_name, l.first_name, l.last_name, l.company, l.company_key,
             l.title, l.gtm_tier, l.gtm_tier_reason, l.linkedin_url,
             a.domain, a.segment
      FROM leads l
      LEFT JOIN accounts a ON a.company_key = l.company_key
      WHERE l.lead_source = 'linkedin_varun' AND l.gtm_tier IN (1, 2, 3)
      ORDER BY l.gtm_tier ASC, l.company ASC, l.id ASC
      LIMIT ${limit}
    `) as OutreachLeadRow[];
  }

  return (await sql`
    SELECT l.id, l.full_name, l.first_name, l.last_name, l.company, l.company_key,
           l.title, l.gtm_tier, l.gtm_tier_reason, l.linkedin_url,
           a.domain, a.segment
    FROM leads l
    LEFT JOIN accounts a ON a.company_key = l.company_key
    WHERE l.lead_source = 'linkedin_varun' AND l.gtm_tier IN (1, 2, 3)
    ORDER BY l.gtm_tier ASC, l.company ASC, l.id ASC
  `) as OutreachLeadRow[];
}

export async function getOutreachLead(sql: Sql, leadId: string): Promise<OutreachLeadRow | null> {
  const rows = (await sql`
    SELECT l.id, l.full_name, l.first_name, l.last_name, l.company, l.company_key,
           l.title, l.gtm_tier, l.gtm_tier_reason, l.linkedin_url,
           a.domain, a.segment
    FROM leads l
    LEFT JOIN accounts a ON a.company_key = l.company_key
    WHERE l.id = ${leadId}
      AND l.lead_source = 'linkedin_varun'
      AND l.gtm_tier IN (1, 2, 3)
    LIMIT 1
  `) as OutreachLeadRow[];
  return rows[0] ?? null;
}

export async function hasOutreachMessage(sql: Sql, leadId: string): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM lead_outreach_messages WHERE lead_id = ${leadId} LIMIT 1
  `) as { "?column?": number }[];
  return rows.length > 0;
}

export async function listPendingOutreachLeads(
  sql: Sql,
  limit: number,
): Promise<OutreachLeadRow[]> {
  return (await sql`
    SELECT l.id, l.full_name, l.first_name, l.last_name, l.company, l.company_key,
           l.title, l.gtm_tier, l.gtm_tier_reason, l.linkedin_url,
           a.domain, a.segment
    FROM leads l
    LEFT JOIN accounts a ON a.company_key = l.company_key
    LEFT JOIN lead_outreach_messages m ON m.lead_id = l.id
    WHERE l.lead_source = 'linkedin_varun'
      AND l.gtm_tier IN (1, 2, 3)
      AND m.lead_id IS NULL
    ORDER BY l.gtm_tier ASC, l.company ASC, l.id ASC
    LIMIT ${limit}
  `) as OutreachLeadRow[];
}

export async function upsertOutreachMessage(
  sql: Sql,
  input: {
    leadId: string;
    messageBody: string;
    companyContext: string;
    workflowArea: string;
    channel?: string;
  },
): Promise<OutreachMessageRow> {
  const id = `outreach_${input.leadId}`;
  const channel = input.channel ?? "linkedin";
  const rows = (await sql`
    INSERT INTO lead_outreach_messages (
      id, lead_id, channel, message_body, company_context, workflow_area, status, updated_at
    )
    VALUES (
      ${id},
      ${input.leadId},
      ${channel},
      ${input.messageBody},
      ${input.companyContext},
      ${input.workflowArea},
      'draft',
      NOW()
    )
    ON CONFLICT (lead_id) DO UPDATE SET
      message_body = EXCLUDED.message_body,
      company_context = EXCLUDED.company_context,
      workflow_area = EXCLUDED.workflow_area,
      channel = EXCLUDED.channel,
      updated_at = NOW()
    RETURNING id, lead_id, channel, message_body, company_context, workflow_area,
              status, generated_at::text, updated_at::text
  `) as OutreachMessageRow[];
  return rows[0];
}

export async function listOutreachForSync(sql: Sql): Promise<OutreachSyncRow[]> {
  return (await sql`
    SELECT m.lead_id, l.full_name, l.company, l.title, l.gtm_tier, l.linkedin_url,
           m.channel, m.message_body, m.workflow_area, m.company_context, m.status,
           m.updated_at::text AS updated_at
    FROM lead_outreach_messages m
    JOIN leads l ON l.id = m.lead_id
    ORDER BY m.lead_id ASC
  `) as OutreachSyncRow[];
}

export async function countOutreachMessages(sql: Sql): Promise<number> {
  const rows = (await sql`SELECT COUNT(*)::int AS cnt FROM lead_outreach_messages`) as {
    cnt: number;
  }[];
  return rows[0]?.cnt ?? 0;
}
