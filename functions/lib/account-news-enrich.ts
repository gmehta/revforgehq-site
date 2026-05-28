import type { Ai } from "@cloudflare/workers-types";
import type { Sql } from "./db.js";
import { extractAiText } from "./trace-narrative.js";
import {
  fetchRecentIndustryNews,
  type RawNewsArticle,
} from "./news-fetch.js";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const MAX_ARTICLES_PER_RUN = 60;
const MAX_COMPANY_QUERIES = 25;
const MAX_EVENTS_PER_ACCOUNT = 25;
const MIN_RELEVANCE_SCORE = 0.6;
const ARTICLE_BATCH_SIZE = 20;

export interface NewsEvent {
  id: string;
  headline: string;
  url: string;
  source: string | null;
  published_at: string | null;
  summary: string;
  relevance_reason: string;
  relevance_score: number;
  fetched_at: string;
}

export interface AccountNewsTarget {
  id: string;
  company_name: string;
  company_key: string;
  domain: string | null;
  segment: string | null;
  tier: number | null;
}

export interface AccountNewsEnrichResult {
  ok: boolean;
  articlesFetched: number;
  accountsEnriched: number;
  eventsAdded: number;
  errors: string[];
}

export interface AccountNewsEnrichOptions {
  newsApiKey?: string;
  hours?: number;
  dryRun?: boolean;
}

interface AiMatchRow {
  articleIndex: number;
  accountId: string;
  relevanceScore: number;
  relevanceReason: string;
  summary: string;
}

const RELEVANCE_SYSTEM_PROMPT = `You are a GTM analyst for RevForgeHQ, an AI consulting startup selling to MarTech, AdTech, SalesTech, and RevOps leaders (CMO, VP Demand Gen, CRO, VP RevOps).

Given recent news headlines and a target account list, identify articles that mention or materially affect specific accounts AND are valuable for B2B outreach.

Valuable signals include: executive moves (CMO/CRO/VP), funding or M&A, AI or martech initiatives, CDP/CRM/marketing automation changes, earnings or strategy shifts in digital marketing, major product launches, partnerships in the marketing/sales stack.

Return ONLY a JSON array (no markdown):
[{"articleIndex":0,"accountId":"acc_123","relevanceScore":0.85,"relevanceReason":"why this matters for outreach","summary":"one sentence account-specific takeaway"}]

Rules:
- relevanceScore must be 0.0–1.0; only include matches >= 0.6
- accountId must exactly match an ID from the account list
- articleIndex must match an article index from the input
- Do not invent accounts or articles
- If no matches, return []`;

function eventId(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  return `news_${Math.abs(hash).toString(36)}`;
}

function parseAiMatches(text: string): AiMatchRow[] {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("[");
  const jsonEnd = trimmed.lastIndexOf("]");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return [];

  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => row as Record<string, unknown>)
      .filter(
        (row) =>
          typeof row.articleIndex === "number" &&
          typeof row.accountId === "string" &&
          typeof row.relevanceScore === "number" &&
          typeof row.relevanceReason === "string" &&
          typeof row.summary === "string",
      )
      .map((row) => ({
        articleIndex: row.articleIndex as number,
        accountId: row.accountId as string,
        relevanceScore: row.relevanceScore as number,
        relevanceReason: row.relevanceReason as string,
        summary: row.summary as string,
      }))
      .filter((row) => row.relevanceScore >= MIN_RELEVANCE_SCORE);
  } catch {
    return [];
  }
}

function mergeEvents(existing: NewsEvent[], incoming: NewsEvent[]): NewsEvent[] {
  const byUrl = new Map<string, NewsEvent>();
  for (const event of [...existing, ...incoming]) {
    byUrl.set(event.url.toLowerCase(), event);
  }
  return [...byUrl.values()]
    .sort((a, b) => {
      const aTime = a.published_at ?? a.fetched_at;
      const bTime = b.published_at ?? b.fetched_at;
      return bTime.localeCompare(aTime);
    })
    .slice(0, MAX_EVENTS_PER_ACCOUNT);
}

async function listAccountsForNews(sql: Sql): Promise<AccountNewsTarget[]> {
  return (await sql`
    SELECT id, company_name, company_key, domain, segment, tier
    FROM accounts
    ORDER BY tier ASC NULLS LAST, company_name ASC
  `) as AccountNewsTarget[];
}

async function scoreArticleBatch(
  ai: Ai,
  articles: RawNewsArticle[],
  accounts: AccountNewsTarget[],
  startIndex: number,
): Promise<AiMatchRow[]> {
  const accountList = accounts
    .map((a) => ({
      id: a.id,
      company_name: a.company_name,
      domain: a.domain,
      segment: a.segment,
      tier: a.tier,
    }))
    .slice(0, 300);

  const articleList = articles.map((article, idx) => ({
    index: startIndex + idx,
    headline: article.headline,
    source: article.source,
    published_at: article.publishedAt,
  }));

  const prompt = `Accounts (JSON):
${JSON.stringify(accountList)}

Articles from the past 24 hours (JSON):
${JSON.stringify(articleList)}

Return matching JSON array only.`;

  const result = await ai.run(MODEL, {
    messages: [
      { role: "system", content: RELEVANCE_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_tokens: 1024,
  });

  return parseAiMatches(extractAiText(result));
}

async function matchArticlesToAccounts(
  ai: Ai,
  articles: RawNewsArticle[],
  accounts: AccountNewsTarget[],
): Promise<Map<string, NewsEvent[]>> {
  const accountIds = new Set(accounts.map((a) => a.id));
  const byAccount = new Map<string, NewsEvent[]>();
  const fetchedAt = new Date().toISOString();

  for (let i = 0; i < articles.length; i += ARTICLE_BATCH_SIZE) {
    const batch = articles.slice(i, i + ARTICLE_BATCH_SIZE);
    const matches = await scoreArticleBatch(ai, batch, accounts, i);

    for (const match of matches) {
      if (!accountIds.has(match.accountId)) continue;
      const article = articles[match.articleIndex];
      if (!article) continue;

      const event: NewsEvent = {
        id: eventId(article.url),
        headline: article.headline,
        url: article.url,
        source: article.source,
        published_at: article.publishedAt,
        summary: match.summary.trim(),
        relevance_reason: match.relevanceReason.trim(),
        relevance_score: match.relevanceScore,
        fetched_at: fetchedAt,
      };

      const list = byAccount.get(match.accountId) ?? [];
      list.push(event);
      byAccount.set(match.accountId, list);
    }
  }

  return byAccount;
}

async function appendAccountNewsEvents(
  sql: Sql,
  accountId: string,
  incoming: NewsEvent[],
): Promise<number> {
  const rows = (await sql`
    SELECT news_events FROM accounts WHERE id = ${accountId} LIMIT 1
  `) as { news_events: NewsEvent[] | null }[];

  const existing = Array.isArray(rows[0]?.news_events) ? rows[0]!.news_events : [];
  const before = existing.length;
  const merged = mergeEvents(existing, incoming);
  const added = merged.length - before;

  if (added > 0) {
    await sql`
      UPDATE accounts
      SET news_events = ${JSON.stringify(merged)}::jsonb,
          updated_at = NOW()
      WHERE id = ${accountId}
    `;
  }

  return Math.max(added, 0);
}

async function recordNewsRun(
  sql: Sql,
  result: AccountNewsEnrichResult,
): Promise<void> {
  await sql`
    INSERT INTO account_news_runs (
      finished_at, articles_fetched, accounts_enriched, events_added, errors
    )
    VALUES (
      NOW(),
      ${result.articlesFetched},
      ${result.accountsEnriched},
      ${result.eventsAdded},
      ${result.errors.length ? JSON.stringify(result.errors) : null}::jsonb
    )
  `;
}

export async function getLatestNewsRun(sql: Sql) {
  const rows = (await sql`
    SELECT id, started_at, finished_at, articles_fetched, accounts_enriched, events_added, errors
    FROM account_news_runs
    ORDER BY id DESC
    LIMIT 1
  `) as {
    id: number;
    started_at: string;
    finished_at: string | null;
    articles_fetched: number | null;
    accounts_enriched: number | null;
    events_added: number | null;
    errors: unknown;
  }[];
  return rows[0] ?? null;
}

export async function runAccountNewsEnrich(
  sql: Sql,
  ai: Ai,
  options: AccountNewsEnrichOptions = {},
): Promise<AccountNewsEnrichResult> {
  const errors: string[] = [];
  const hours = options.hours ?? 24;

  const accounts = await listAccountsForNews(sql);
  if (!accounts.length) {
    const empty: AccountNewsEnrichResult = {
      ok: true,
      articlesFetched: 0,
      accountsEnriched: 0,
      eventsAdded: 0,
      errors: ["No accounts in database"],
    };
    if (!options.dryRun) await recordNewsRun(sql, empty);
    return empty;
  }

  const tier12 = accounts
    .filter((a) => a.tier != null && a.tier <= 2)
    .slice(0, MAX_COMPANY_QUERIES)
    .map((a) => ({ companyName: a.company_name, domain: a.domain }));

  const { articles, errors: fetchErrors } = await fetchRecentIndustryNews({
    newsApiKey: options.newsApiKey,
    hours,
    includeCompanyQueries: tier12.length > 0,
    companyQueries: tier12,
  });
  errors.push(...fetchErrors);

  const trimmedArticles = articles.slice(0, MAX_ARTICLES_PER_RUN);
  if (!trimmedArticles.length) {
    const noNews: AccountNewsEnrichResult = {
      ok: errors.length === 0,
      articlesFetched: 0,
      accountsEnriched: 0,
      eventsAdded: 0,
      errors: errors.length ? errors : ["No recent articles found"],
    };
    if (!options.dryRun) await recordNewsRun(sql, noNews);
    return noNews;
  }

  let matchesByAccount: Map<string, NewsEvent[]>;
  try {
    matchesByAccount = await matchArticlesToAccounts(ai, trimmedArticles, accounts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`AI matching failed: ${message}`);
    const failed: AccountNewsEnrichResult = {
      ok: false,
      articlesFetched: trimmedArticles.length,
      accountsEnriched: 0,
      eventsAdded: 0,
      errors,
    };
    if (!options.dryRun) await recordNewsRun(sql, failed);
    return failed;
  }

  let accountsEnriched = 0;
  let eventsAdded = 0;

  if (!options.dryRun) {
    for (const [accountId, events] of matchesByAccount) {
      const added = await appendAccountNewsEvents(sql, accountId, events);
      if (added > 0) {
        accountsEnriched += 1;
        eventsAdded += added;
      }
    }
  } else {
    accountsEnriched = matchesByAccount.size;
    eventsAdded = [...matchesByAccount.values()].reduce((sum, list) => sum + list.length, 0);
  }

  const result: AccountNewsEnrichResult = {
    ok: errors.length === 0,
    articlesFetched: trimmedArticles.length,
    accountsEnriched,
    eventsAdded,
    errors,
  };

  if (!options.dryRun) await recordNewsRun(sql, result);
  return result;
}
