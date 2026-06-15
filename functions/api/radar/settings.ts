import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { corsPreflightResponse, errorResponse, jsonResponse, requireDatabaseUrl } from "../../lib/env.js";
import { requireUser } from "../../lib/radar-user.js";

// Light validation. Timezone must look like an IANA zone; time must be HH:MM 24h.
const TZ_RE = /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)+$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => corsPreflightResponse(request);

// GET /api/radar/settings — current account + brand settings for the signed-in user.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const aid = await requireUser(request, env);
  if (aid instanceof Response) return aid;
  try {
    const sql = getSql(requireDatabaseUrl(env));
    const rows = await sql`
      SELECT a.full_name, a.email, a.plan, a.status,
             b.brand_name, b.domain, b.timezone,
             to_char(b.report_ready_by, 'HH24:MI') AS report_ready_by,
             (SELECT COUNT(*)::int FROM radar_tracked_prompts p WHERE p.brand_id = b.id AND p.active) AS prompts,
             (SELECT COUNT(*)::int FROM radar_competitors c WHERE c.brand_id = b.id) AS competitors
      FROM radar_accounts a
      LEFT JOIN LATERAL (SELECT id, brand_name, domain, timezone, report_ready_by FROM radar_brands WHERE account_id = a.id ORDER BY created_at LIMIT 1) b ON true
      WHERE a.id = ${aid} LIMIT 1`;
    if (!rows.length) return errorResponse("Account not found", 404);
    return jsonResponse({ ok: true, settings: rows[0] });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Failed to load settings", 500);
  }
};

// POST /api/radar/settings — update display name, timezone, and report delivery time.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const aid = await requireUser(request, env);
  if (aid instanceof Response) return aid;

  let body: { full_name?: string; timezone?: string; report_ready_by?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid JSON body", 400, request);
  }

  const fullName = body.full_name != null ? String(body.full_name).trim() : undefined;
  const timezone = body.timezone != null ? String(body.timezone).trim() : undefined;
  const reportReadyBy = body.report_ready_by != null ? String(body.report_ready_by).trim() : undefined;

  if (fullName != null && fullName.length < 2) return errorResponse("Please enter your name", 400, request);
  if (timezone != null && !TZ_RE.test(timezone)) return errorResponse("That timezone doesn't look right", 400, request);
  if (reportReadyBy != null && !TIME_RE.test(reportReadyBy)) return errorResponse("Report time must be HH:MM (24-hour)", 400, request);

  try {
    const sql = getSql(requireDatabaseUrl(env));
    if (fullName != null) {
      await sql`UPDATE radar_accounts SET full_name = ${fullName} WHERE id = ${aid}`;
    }
    if (timezone != null || reportReadyBy != null) {
      await sql`
        UPDATE radar_brands
        SET timezone = COALESCE(${timezone ?? null}, timezone),
            report_ready_by = COALESCE(${reportReadyBy ?? null}::time, report_ready_by)
        WHERE account_id = ${aid}`;
    }
    return jsonResponse({ ok: true }, 200, request);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Failed to save settings", 500, request);
  }
};
