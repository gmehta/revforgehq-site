import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import {
  errorResponse,
  jsonResponse,
  requireDatabaseUrl,
  requireLeadsApiKey,
} from "../../lib/env.js";
import { getLeadById, getRecentSendsForLead } from "../../lib/leads.js";


function leadIdFromParams(params: Record<string, string | string[] | undefined>): string | null {
  const raw = params.id;
  if (typeof raw === "string" && raw) return raw;
  if (Array.isArray(raw) && raw[0]) return raw[0];
  return null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = requireLeadsApiKey(request, env);
  if (auth instanceof Response) return auth;

  const id = leadIdFromParams(params);
  if (!id) {
    return errorResponse("Lead id is required", 400);
  }

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const lead = await getLeadById(sql, id);
    if (!lead) {
      return errorResponse("Lead not found", 404);
    }
    const sends = await getRecentSendsForLead(sql, id);
    return jsonResponse({ ok: true, lead, sends });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load lead";
    return errorResponse(message, 500);
  }
};
