import type { Sql } from "./db.js";
import {
  fetchCompanyNews,
  fetchNewsApiCompanyNews,
  type RawNewsArticle,
} from "./news-fetch.js";

export interface StoredNewsEvent {
  headline: string;
  url: string;
  summary?: string;
  published_at?: string | null;
  source?: string | null;
}

export interface CompanyContextResult {
  hook: string;
  source: string;
  url: string | null;
  fullContext: string;
}

export type CompanyContextCache = Map<string, CompanyContextResult>;

function pickBestArticle(articles: RawNewsArticle[]): RawNewsArticle | null {
  if (!articles.length) return null;
  return [...articles].sort((a, b) => {
    const aTime = a.publishedAt ?? "";
    const bTime = b.publishedAt ?? "";
    return bTime.localeCompare(aTime);
  })[0];
}

function fromNewsEvent(event: StoredNewsEvent): CompanyContextResult {
  const headline = event.headline.trim();
  const summary = event.summary?.trim();
  const hook = summary || headline;
  return {
    hook,
    source: event.source?.trim() || "account news agent",
    url: event.url?.trim() || null,
    fullContext: summary ? `${headline} — ${summary}` : headline,
  };
}

function fromArticle(article: RawNewsArticle, sourceLabel: string): CompanyContextResult {
  const headline = article.headline.trim();
  return {
    hook: headline,
    source: article.source?.trim() || sourceLabel,
    url: article.url?.trim() || null,
    fullContext: headline,
  };
}

function fromMetadata(companyName: string, segment: string | null): CompanyContextResult {
  const segmentText = segment?.trim();
  const hook = segmentText
    ? `${companyName} operates in ${segmentText} — relevant context for GTM and marketing ops leaders.`
    : `${companyName} is on our radar given your team's focus on revenue and marketing operations.`;
  return {
    hook,
    source: "account metadata",
    url: null,
    fullContext: hook,
  };
}

async function loadAccountNewsEvents(
  sql: Sql,
  companyKey: string,
): Promise<StoredNewsEvent[]> {
  const rows = (await sql`
    SELECT news_events FROM accounts WHERE company_key = ${companyKey} LIMIT 1
  `) as { news_events: StoredNewsEvent[] | null }[];
  const events = rows[0]?.news_events;
  return Array.isArray(events) ? events : [];
}

export async function getCompanyContext(
  sql: Sql,
  input: {
    companyKey: string;
    companyName: string;
    domain: string | null;
    segment: string | null;
    newsApiKey?: string;
  },
  cache?: CompanyContextCache,
): Promise<CompanyContextResult> {
  const cacheKey = input.companyKey.trim().toLowerCase();
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  let result: CompanyContextResult;

  const storedEvents = await loadAccountNewsEvents(sql, input.companyKey);
  if (storedEvents.length) {
    const sorted = [...storedEvents].sort((a, b) =>
      (b.published_at ?? "").localeCompare(a.published_at ?? ""),
    );
    result = fromNewsEvent(sorted[0]);
  } else if (input.newsApiKey) {
    try {
      const articles = await fetchNewsApiCompanyNews(
        input.companyName,
        input.domain,
        input.newsApiKey,
        30,
      );
      const best = pickBestArticle(articles);
      result = best ? fromArticle(best, "NewsAPI") : fromMetadata(input.companyName, input.segment);
    } catch {
      try {
        const rss = await fetchCompanyNews(input.companyName, input.domain, 30);
        const best = pickBestArticle(rss);
        result = best ? fromArticle(best, "Google News") : fromMetadata(input.companyName, input.segment);
      } catch {
        result = fromMetadata(input.companyName, input.segment);
      }
    }
  } else {
    try {
      const rss = await fetchCompanyNews(input.companyName, input.domain, 30);
      const best = pickBestArticle(rss);
      result = best ? fromArticle(best, "Google News") : fromMetadata(input.companyName, input.segment);
    } catch {
      result = fromMetadata(input.companyName, input.segment);
    }
  }

  cache?.set(cacheKey, result);
  return result;
}
