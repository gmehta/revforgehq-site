import { parseRssFeed } from "./news-fetch.js";

export type StackQueryType = "salestech" | "martech" | "adtech" | "domain";

export interface StackSignal {
  headline: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
  queryType: StackQueryType;
}

function quoteCompany(name: string): string {
  return `"${name.replace(/"/g, "").trim()}"`;
}

function googleNewsRssUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

async function fetchRssQuery(query: string, queryType: StackQueryType): Promise<StackSignal[]> {
  const response = await fetch(googleNewsRssUrl(query), {
    headers: { "User-Agent": "RevForgeHQ-StackAgent/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Google News RSS failed (${response.status}) for: ${query}`);
  }
  const xml = await response.text();
  const articles = parseRssFeed(xml);
  return articles.map((article) => ({
    headline: article.headline,
    url: article.url,
    source: article.source,
    publishedAt: article.publishedAt,
    queryType,
  }));
}

function dedupeSignals(signals: StackSignal[]): StackSignal[] {
  const seen = new Set<string>();
  const out: StackSignal[] = [];
  for (const signal of signals) {
    const key = signal.url.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out;
}

export function buildStackQueries(companyName: string): { query: string; queryType: StackQueryType }[] {
  const q = quoteCompany(companyName);
  return [
    {
      queryType: "salestech",
      query: `${q} (Salesforce OR HubSpot OR Gong OR Outreach OR Salesloft) (job OR hiring OR careers) when:365d`,
    },
    {
      queryType: "martech",
      query: `${q} (Marketo OR Segment OR Braze OR Adobe OR Iterable OR CDP) (marketing OR martech) when:365d`,
    },
    {
      queryType: "adtech",
      query: `${q} (Google Ads OR "Trade Desk" OR DV360 OR "Meta Ads" OR programmatic) (advertising OR media) when:365d`,
    },
    {
      queryType: "domain",
      query: `${q} official website when:365d`,
    },
  ];
}

export async function fetchStackSignals(companyName: string): Promise<{
  signals: StackSignal[];
  errors: string[];
}> {
  const errors: string[] = [];
  const batches: StackSignal[][] = [];

  for (const { query, queryType } of buildStackQueries(companyName)) {
    try {
      batches.push(await fetchRssQuery(query, queryType));
    } catch (err) {
      errors.push(`${queryType}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    signals: dedupeSignals(batches.flat()).slice(0, 24),
    errors,
  };
}

export function signalsForPrompt(signals: StackSignal[]): { queryType: string; headline: string; url: string; source: string | null }[] {
  return signals.map((s) => ({
    queryType: s.queryType,
    headline: s.headline,
    url: s.url,
    source: s.source,
  }));
}
