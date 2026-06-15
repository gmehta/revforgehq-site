import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { errorResponse, jsonResponse, requireDatabaseUrl } from "../../lib/env.js";
import { requireUser } from "../../lib/radar-user.js";

// GET /api/radar/reports — the signed-in user's account + their reports (newest first).
// The dashboard renders this; each report links to /api/radar/report?id=&t=<view_token>.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const aid = await requireUser(request, env);
  if (aid instanceof Response) return aid;

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const accts = await sql`
      SELECT a.full_name, a.email, a.plan, a.status, a.trial_ends_at, b.brand_name, b.domain
      FROM radar_accounts a
      LEFT JOIN LATERAL (SELECT brand_name, domain FROM radar_brands WHERE account_id = a.id ORDER BY created_at LIMIT 1) b ON true
      WHERE a.id = ${aid} LIMIT 1`;
    if (!accts.length) return errorResponse("Account not found", 404);

    const reports = await sql`
      SELECT r.id, r.view_token, r.kind, r.tier, r.mention_rate, r.is_mock, r.created_at, b.brand_name
      FROM radar_reports r
      JOIN radar_brands b ON b.id = r.brand_id
      WHERE r.account_id = ${aid}
      ORDER BY r.created_at DESC
      LIMIT 100`;

    return jsonResponse({ ok: true, account: accts[0], reports });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Failed to load reports", 500);
  }
};
