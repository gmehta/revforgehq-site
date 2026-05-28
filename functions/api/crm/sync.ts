import { getSql } from "../../lib/db.js";
import { getLatestSyncRun } from "../../lib/accounts.js";
import { runCrmSync } from "../../lib/crm-sync.js";
import type { Env } from "../../lib/env.js";
import {
  errorResponse,
  jsonResponse,
  requireDatabaseUrl,
  requireLeadsApiKey,
} from "../../lib/env.js";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = requireLeadsApiKey(request, env);
  if (auth instanceof Response) return auth;

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const lastRun = await getLatestSyncRun(sql);
    return jsonResponse({ ok: true, lastRun });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read sync status";
    return errorResponse(message, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = requireLeadsApiKey(request, env);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const full = url.searchParams.get("full") === "true";
    const leadsOnly = url.searchParams.get("leads_only") === "true";
    const accountsOnly = url.searchParams.get("accounts_only") === "true";
    const outreachOnly = url.searchParams.get("outreach_only") === "true";

    const sql = getSql(requireDatabaseUrl(env));
    const result = await runCrmSync(sql, env, { full, leadsOnly, accountsOnly, outreachOnly });
    return jsonResponse({ ok: result.ok, ...result }, result.ok ? 200 : 207);
  } catch (err) {
    const message = err instanceof Error ? err.message : "CRM sync failed";
    return errorResponse(message, 500);
  }
};
