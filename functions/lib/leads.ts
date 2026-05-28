import type { Sql } from "./db.js";

export interface LeadRow {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  company_key: string | null;
  title: string | null;
  tier: number | null;
  tier_reason: string | null;
  score: number | null;
  is_decision_maker: boolean | null;
  dm_reason: string | null;
  email: string | null;
  email_status: string | null;
  lead_source: string;
  linkedin_url: string | null;
  outreach_status: string;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadSendRow {
  id: number;
  lead_id: string;
  postmark_message_id: string | null;
  from_email: string;
  to_email: string;
  subject: string;
  status: string;
  error: string | null;
  sent_at: string;
}

export interface ListLeadsFilters {
  tier?: number;
  hasEmail?: boolean;
  status?: string;
  source?: string;
  limit: number;
  offset: number;
}

export async function listLeads(sql: Sql, filters: ListLeadsFilters): Promise<LeadRow[]> {
  const tier = filters.tier ?? null;
  const hasEmail = filters.hasEmail ?? false;
  const status = filters.status ?? null;
  const source = filters.source ?? null;

  return (await sql`
    SELECT id, full_name, first_name, last_name, company, company_key, title,
           tier, tier_reason, score, is_decision_maker, dm_reason,
           email, email_status, lead_source, linkedin_url,
           outreach_status, last_contacted_at,
           created_at, updated_at
    FROM leads
    WHERE (${tier}::int IS NULL OR tier = ${tier})
      AND (${hasEmail}::boolean = false OR (email IS NOT NULL AND email <> ''))
      AND (${status}::text IS NULL OR outreach_status = ${status})
      AND (${source}::text IS NULL OR lead_source = ${source})
    ORDER BY tier ASC NULLS LAST, score DESC NULLS LAST, id ASC
    LIMIT ${filters.limit} OFFSET ${filters.offset}
  `) as LeadRow[];
}

export async function getLeadById(sql: Sql, id: string): Promise<LeadRow | null> {
  const rows = (await sql`
    SELECT id, full_name, first_name, last_name, company, company_key, title,
           tier, tier_reason, score, is_decision_maker, dm_reason,
           email, email_status, lead_source, linkedin_url,
           outreach_status, last_contacted_at,
           created_at, updated_at
    FROM leads
    WHERE id = ${id}
    LIMIT 1
  `) as LeadRow[];
  return rows[0] ?? null;
}

export async function getRecentSendsForLead(sql: Sql, leadId: string, limit = 10): Promise<LeadSendRow[]> {
  return (await sql`
    SELECT id, lead_id, postmark_message_id, from_email, to_email, subject,
           status, error, sent_at
    FROM lead_email_sends
    WHERE lead_id = ${leadId}
    ORDER BY sent_at DESC
    LIMIT ${limit}
  `) as LeadSendRow[];
}

export async function recordEmailSend(
  sql: Sql,
  input: {
    leadId: string;
    messageId: string | null;
    fromEmail: string;
    toEmail: string;
    subject: string;
    status: string;
    error?: string | null;
  },
): Promise<void> {
  await sql`
    INSERT INTO lead_email_sends (
      lead_id, postmark_message_id, from_email, to_email, subject, status, error
    ) VALUES (
      ${input.leadId},
      ${input.messageId},
      ${input.fromEmail},
      ${input.toEmail},
      ${input.subject},
      ${input.status},
      ${input.error ?? null}
    )
  `;

  if (input.status === "submitted") {
    await sql`
      UPDATE leads
      SET outreach_status = 'sent', last_contacted_at = NOW(), updated_at = NOW()
      WHERE id = ${input.leadId}
    `;
  }
}
