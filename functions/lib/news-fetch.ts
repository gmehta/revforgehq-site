export interface RawNewsArticle {
  headline: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
}

const RSS_ITEM_RE =
  /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
const TAG_RE = (tag: string) =>
  new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${tag}>`, "i");

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function readTag(block: string, tag: string): string | null {
  const match = block.match(TAG_RE(tag));
  if (!match) return null;
  return decodeXml((match[1] ?? match[2] ?? "").trim()) || null;
}

export function parseRssFeed(xml: string): RawNewsArticle[] {
  const articles: RawNewsArticle[] = [];
  for (const match of xml.matchAll(RSS_ITEM_RE)) {
    const block = match[1];
    const headline = readTag(block, "title");
    const url = readTag(block, "link");
    if (!headline || !url) continue;

    const pubDate = readTag(block, "pubDate");
    const sourceBlock = readTag(block, "source");
    articles.push({
      headline,
      url,
      source: sourceBlock,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
    });
  }
  return articles;
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function filterRecentArticles(
  articles: RawNewsArticle[],
  hours = 24,
): RawNewsArticle[] {
  const cutoff = hoursAgoIso(hours);
  return articles.filter((article) => {
    if (!article.publishedAt) return true;
    return article.publishedAt >= cutoff;
  });
}

function dedupeArticles(articles: RawNewsArticle[]): RawNewsArticle[] {
  const seen = new Set<string>();
  const out: RawNewsArticle[] = [];
  for (const article of articles) {
    const key = article.url.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(article);
  }
  return out;
}

const INDUSTRY_QUERIES = [
  "martech OR adtech OR salestech OR revops when:1d",
  "marketing automation OR customer data platform OR CDP when:1d",
  "CMO OR chief marketing officer OR revenue operations when:1d",
];

function googleNewsRssUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

async function fetchRssArticles(query: string): Promise<RawNewsArticle[]> {
  const response = await fetch(googleNewsRssUrl(query), {
    headers: { "User-Agent": "RevForgeHQ-NewsAgent/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Google News RSS failed (${response.status}) for query: ${query}`);
  }
  const xml = await response.text();
  return parseRssFeed(xml);
}

async function fetchNewsApiArticles(apiKey: string, hours = 24): Promise<RawNewsArticle[]> {
  const from = hoursAgoIso(hours).slice(0, 10);
  const params = new URLSearchParams({
    q: '("martech" OR "adtech" OR "salestech" OR "revops" OR "marketing automation" OR "customer data platform")',
    from,
    sortBy: "publishedAt",
    language: "en",
    pageSize: "100",
    apiKey,
  });
  const response = await fetch(`https://newsapi.org/v2/everything?${params.toString()}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`NewsAPI failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    articles?: { title?: string; url?: string; source?: { name?: string }; publishedAt?: string }[];
  };
  return (data.articles ?? [])
    .filter((a) => a.title && a.url)
    .map((a) => ({
      headline: a.title!.trim(),
      url: a.url!.trim(),
      source: a.source?.name ?? null,
      publishedAt: a.publishedAt ?? null,
    }));
}

export async function fetchCompanyNews(
  companyName: string,
  domain: string | null,
  days = 30,
): Promise<RawNewsArticle[]> {
  const quoted = `"${companyName.replace(/"/g, "")}"`;
  const when = days <= 1 ? "1d" : days <= 7 ? "7d" : "30d";
  const query = domain ? `${quoted} OR site:${domain} when:${when}` : `${quoted} when:${when}`;
  return fetchRssArticles(query);
}

export async function fetchNewsApiCompanyNews(
  companyName: string,
  domain: string | null,
  apiKey: string,
  days = 30,
): Promise<RawNewsArticle[]> {
  const cleanName = companyName.replace(/"/g, "").trim();
  const q = domain
    ? `"${cleanName}" OR "${domain}"`
    : `"${cleanName}"`;
  const hours = Math.min(Math.max(days, 1), 30) * 24;
  const from = hoursAgoIso(hours).slice(0, 10);
  const params = new URLSearchParams({
    q,
    from,
    sortBy: "publishedAt",
    language: "en",
    pageSize: "5",
    apiKey,
  });
  const response = await fetch(`https://newsapi.org/v2/everything?${params.toString()}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`NewsAPI company query failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    articles?: { title?: string; url?: string; source?: { name?: string }; publishedAt?: string }[];
  };
  return (data.articles ?? [])
    .filter((a) => a.title && a.url)
    .map((a) => ({
      headline: a.title!.trim(),
      url: a.url!.trim(),
      source: a.source?.name ?? null,
      publishedAt: a.publishedAt ?? null,
    }));
}

export interface FetchNewsOptions {
  newsApiKey?: string;
  hours?: number;
  includeCompanyQueries?: boolean;
  companyQueries?: { companyName: string; domain: string | null }[];
}

export async function fetchRecentIndustryNews(
  options: FetchNewsOptions = {},
): Promise<{ articles: RawNewsArticle[]; errors: string[] }> {
  const hours = options.hours ?? 24;
  const errors: string[] = [];
  const batches: RawNewsArticle[][] = [];

  if (options.newsApiKey) {
    try {
      batches.push(await fetchNewsApiArticles(options.newsApiKey, hours));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  for (const query of INDUSTRY_QUERIES) {
    try {
      batches.push(await fetchRssArticles(query));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (options.includeCompanyQueries && options.companyQueries?.length) {
    for (const company of options.companyQueries) {
      try {
        batches.push(await fetchCompanyNews(company.companyName, company.domain));
      } catch (err) {
        errors.push(
          `${company.companyName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  const articles = dedupeArticles(filterRecentArticles(batches.flat(), hours));
  return { articles, errors };
}
