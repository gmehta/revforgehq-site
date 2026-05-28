import { getSql } from "../lib/db.js";
import type { Env } from "../lib/env.js";
import {
  errorResponse,
  jsonResponse,
  requireDatabaseUrl,
  requireLeadsApiKey,
} from "../lib/env.js";
import { listLeads } from "../lib/leads.js";

function parseListFilters(url: URL) {
  const tierRaw = url.searchParams.get("tier");
  const tier = tierRaw ? Number(tierRaw) : undefined;
  const hasEmail = url.searchParams.get("has_email") === "true";
  const status = url.searchParams.get("status") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "50"), 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);
  return {
    tier: Number.isFinite(tier) ? tier : undefined,
    hasEmail: url.searchParams.get("has_email") === "true" ? true : undefined,
    status,
    source,
    limit,
    offset,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = requireLeadsApiKey(request, env);
  if (auth instanceof Response) return auth;

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const filters = parseListFilters(new URL(request.url));
    const leads = await listLeads(sql, filters);
    return jsonResponse({ ok: true, count: leads.length, leads, filters });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list leads";
    return errorResponse(message, 500);
  }
};
