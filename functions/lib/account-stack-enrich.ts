import type { Ai } from "@cloudflare/workers-types";
import type { Sql } from "./db.js";
import { extractTechStackFromSignals, type ExtractedTechStack } from "./stack-extract.js";
import { fetchStackSignals } from "./stack-research.js";

export interface AccountStackTarget {
  id: string;
  company_name: string;
  company_key: string;
  domain: string | null;
  segment: string | null;
}

export interface AccountStackEnrichResult {
  ok: boolean;
  accountsProcessed: number;
  accountsEnriched: number;
  errors: string[];
}

export interface TechStackRecord extends ExtractedTechStack {
  enriched_at: string;
}

function isEnriched(techStack: unknown): boolean {
  if (!techStack || typeof techStack !== "object") return false;
  const record = techStack as Record<string, unknown>;
  return typeof record.enriched_at === "string" && record.enriched_at.length > 0;
}

export async function listAccountsPendingStack(
  sql: Sql,
  limit: number,
): Promise<AccountStackTarget[]> {
  return (await sql`
    SELECT id, company_name, company_key, domain, segment
    FROM accounts
    WHERE tech_stack = '{}'::jsonb
       OR (tech_stack->>'enriched_at') IS NULL
    ORDER BY tier ASC NULLS LAST, company_name ASC
    LIMIT ${limit}
  `) as AccountStackTarget[];
}

export async function listAllAccountsForStack(sql: Sql, limit: number): Promise<AccountStackTarget[]> {
  return (await sql`
    SELECT id, company_name, company_key, domain, segment
    FROM accounts
    ORDER BY tier ASC NULLS LAST, company_name ASC
    LIMIT ${limit}
  `) as AccountStackTarget[];
}

export async function getAccountForStack(
  sql: Sql,
  accountId: string,
): Promise<AccountStackTarget | null> {
  const rows = (await sql`
    SELECT id, company_name, company_key, domain, segment
    FROM accounts
    WHERE id = ${accountId}
    LIMIT 1
  `) as AccountStackTarget[];
  return rows[0] ?? null;
}

export async function hasStackEnrichment(sql: Sql, accountId: string): Promise<boolean> {
  const rows = (await sql`
    SELECT tech_stack FROM accounts WHERE id = ${accountId} LIMIT 1
  `) as { tech_stack: unknown }[];
  return isEnriched(rows[0]?.tech_stack);
}

export async function enrichAccountStack(
  ai: Ai,
  sql: Sql,
  account: AccountStackTarget,
): Promise<TechStackRecord> {
  const companyName = account.company_name.replace(/^"|"$/g, "").trim();
  const { signals, errors } = await fetchStackSignals(companyName);

  const extracted = await extractTechStackFromSignals(ai, {
    companyName,
    segment: account.segment,
    signals,
  });

  const techStack: TechStackRecord = {
    ...extracted,
    enriched_at: new Date().toISOString(),
  };

  const shouldSetDomain =
    !account.domain &&
    extracted.inferred_domain &&
    (extracted.confidence === "high" || extracted.confidence === "medium");

  await sql`
    UPDATE accounts
    SET tech_stack = ${JSON.stringify({ ...techStack, fetch_errors: errors.length ? errors : undefined })}::jsonb,
        domain = CASE
          WHEN ${shouldSetDomain} THEN ${extracted.inferred_domain}
          ELSE domain
        END,
        updated_at = NOW()
    WHERE id = ${account.id}
  `;

  return techStack;
}

export async function getLatestStackRun(sql: Sql) {
  const rows = (await sql`
    SELECT id, started_at, finished_at, accounts_processed, accounts_enriched, errors
    FROM account_stack_runs
    ORDER BY id DESC
    LIMIT 1
  `) as {
    id: number;
    started_at: string;
    finished_at: string | null;
    accounts_processed: number | null;
    accounts_enriched: number | null;
    errors: unknown;
  }[];
  return rows[0] ?? null;
}

export async function countStackEnriched(sql: Sql): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::int AS cnt
    FROM accounts
    WHERE (tech_stack->>'enriched_at') IS NOT NULL
  `) as { cnt: number }[];
  return rows[0]?.cnt ?? 0;
}

export async function countAccounts(sql: Sql): Promise<number> {
  const rows = (await sql`SELECT COUNT(*)::int AS cnt FROM accounts`) as { cnt: number }[];
  return rows[0]?.cnt ?? 0;
}

export async function recordStackRun(
  sql: Sql,
  result: AccountStackEnrichResult,
): Promise<void> {
  await sql`
    INSERT INTO account_stack_runs (
      finished_at, accounts_processed, accounts_enriched, errors
    )
    VALUES (
      NOW(),
      ${result.accountsProcessed},
      ${result.accountsEnriched},
      ${result.errors.length ? JSON.stringify(result.errors) : null}::jsonb
    )
  `;
}

export async function runAccountStackEnrichBatch(
  ai: Ai,
  sql: Sql,
  accounts: AccountStackTarget[],
): Promise<AccountStackEnrichResult> {
  const errors: string[] = [];
  let accountsEnriched = 0;

  for (const account of accounts) {
    try {
      await enrichAccountStack(ai, sql, account);
      accountsEnriched += 1;
    } catch (err) {
      errors.push(`${account.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const result: AccountStackEnrichResult = {
    ok: errors.length === 0,
    accountsProcessed: accounts.length,
    accountsEnriched,
    errors,
  };

  if (accounts.length > 0) {
    await recordStackRun(sql, result);
  }

  return result;
}
