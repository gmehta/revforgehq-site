import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { errorResponse, jsonResponse, requireDatabaseUrl, requireRadarSecret } from "../../lib/env.js";
import { sendPostmarkEmail } from "../../lib/postmark.js";
import {
  buildOwnerNotifyEmail,
  logSignupEvent,
  RADAR_OWNER_EMAIL,
  radarFromEmail,
  readVerifyToken,
} from "../../lib/radar.js";

// GET /api/radar/verify?token=...
// Does NOT activate. Corporate email security scanners (Microsoft Safe Links,
// Proofpoint, Mimecast, …) auto-fetch every link in inbound email, so activating
// on GET would "confirm" accounts no human clicked. Instead we bounce to the
// confirmation page, where a real button-click POSTs back to activate.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const base = (env.PUBLIC_BASE_URL?.trim() || new URL(request.url).origin).replace(/\/$/, "");
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  return Response.redirect(`${base}/radar/confirm?token=${encodeURIComponent(token)}`, 302);
};

// POST /api/radar/verify  { token }  — the real human confirmation (button click).
// Activates the trial, queues the first scan, notifies the owner.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secret = requireRadarSecret(env);
  if (secret instanceof Response) return secret;

  let token = "";
  try {
    token = ((await request.json()) as { token?: string }).token?.trim() ?? "";
  } catch {
    /* no body */
  }
  if (!token) return errorResponse("missing-token", 400);

  const accountId = await readVerifyToken(token, secret);
  if (!accountId) return errorResponse("expired", 401);

  try {
    const sql = getSql(requireDatabaseUrl(env));

    const accounts = await sql`SELECT id, email, full_name, status FROM radar_accounts WHERE id = ${accountId} LIMIT 1`;
    if (!accounts.length) return errorResponse("not-found", 404);
    const account = accounts[0] as { id: string; email: string; full_name: string; status: string };

    const brands = await sql`SELECT id, domain, brand_name FROM radar_brands WHERE account_id = ${accountId} ORDER BY created_at LIMIT 1`;
    const brand = brands[0] as { id: string; domain: string; brand_name: string } | undefined;

    // Idempotent: a second confirm just returns ok.
    if (account.status !== "active") {
      await sql`UPDATE radar_accounts SET status = 'active', verified_at = NOW() WHERE id = ${accountId}`;

      if (brand) {
        const existingJob = await sql`SELECT id FROM radar_scan_jobs WHERE brand_id = ${brand.id} AND kind = 'first_scan' LIMIT 1`;
        if (!existingJob.length) {
          await sql`INSERT INTO radar_scan_jobs (brand_id, kind, status) VALUES (${brand.id}, 'first_scan', 'queued')`;
        }

        const postmarkToken = env.POSTMARK_SERVER_TOKEN?.trim();
        if (postmarkToken) {
          const counts = await sql`
            SELECT
              (SELECT COUNT(*)::int FROM radar_tracked_prompts WHERE brand_id = ${brand.id} AND active) AS prompts,
              (SELECT COUNT(*)::int FROM radar_competitors     WHERE brand_id = ${brand.id})            AS competitors`;
          const { text, html } = buildOwnerNotifyEmail(
            { email: account.email, name: account.full_name },
            { brand: brand.brand_name, domain: brand.domain, prompts: counts[0]?.prompts ?? 0, competitors: counts[0]?.competitors ?? 0 },
          );
          try {
            await sendPostmarkEmail({
              token: postmarkToken,
              from: `RevForge Radar <${radarFromEmail(env.RADAR_FROM_EMAIL)}>`,
              to: RADAR_OWNER_EMAIL,
              subject: `New Radar trial: ${brand.brand_name} (${brand.domain})`,
              textBody: text,
              htmlBody: html,
            });
          } catch {
            /* owner notification is best-effort */
          }
        }
      }

      await logSignupEvent(sql, { email: account.email, event: "verified", detail: brand?.domain ?? null });
    }

    return jsonResponse({ ok: true, brand: brand?.brand_name ?? null });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "server-error", 500);
  }
};
