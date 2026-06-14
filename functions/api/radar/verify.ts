import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { requireDatabaseUrl, requireRadarSecret } from "../../lib/env.js";
import { sendPostmarkEmail } from "../../lib/postmark.js";
import {
  buildOwnerNotifyEmail,
  logSignupEvent,
  RADAR_OWNER_EMAIL,
  radarFromEmail,
  readVerifyToken,
} from "../../lib/radar.js";

// GET /api/radar/verify?token=...  — clicked from the confirmation email.
// Verifies, activates the trial, queues the first scan, notifies the owner,
// then 302-redirects to the welcome page.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const base = (env.PUBLIC_BASE_URL?.trim() || new URL(request.url).origin).replace(/\/$/, "");
  const fail = (reason: string) => Response.redirect(`${base}/radar/welcome.html?status=error&reason=${encodeURIComponent(reason)}`, 302);

  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) return fail("missing-token");

  const secret = requireRadarSecret(env);
  if (secret instanceof Response) return fail("not-configured");

  const accountId = await readVerifyToken(token, secret);
  if (!accountId) return fail("expired");

  try {
    const sql = getSql(requireDatabaseUrl(env));

    const accounts = await sql`SELECT id, email, full_name, status FROM radar_accounts WHERE id = ${accountId} LIMIT 1`;
    if (!accounts.length) return fail("not-found");
    const account = accounts[0] as { id: string; email: string; full_name: string; status: string };

    const brands = await sql`SELECT id, domain, brand_name FROM radar_brands WHERE account_id = ${accountId} ORDER BY created_at LIMIT 1`;
    const brand = brands[0] as { id: string; domain: string; brand_name: string } | undefined;

    // Idempotent: a second click just lands on success.
    if (account.status !== "active") {
      await sql`UPDATE radar_accounts SET status = 'active', verified_at = NOW() WHERE id = ${accountId}`;

      if (brand) {
        // Queue the first scan unless one already exists (re-click safety).
        const existingJob = await sql`SELECT id FROM radar_scan_jobs WHERE brand_id = ${brand.id} AND kind = 'first_scan' LIMIT 1`;
        if (!existingJob.length) {
          await sql`INSERT INTO radar_scan_jobs (brand_id, kind, status) VALUES (${brand.id}, 'first_scan', 'queued')`;
        }

        // Notify the owner so the (Phase 0/1) pipeline can run for this brand.
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
            /* owner notification is best-effort — never block activation on it */
          }
        }
      }

      await logSignupEvent(sql, { email: account.email, event: "verified", detail: brand?.domain ?? null });
    }

    const brandParam = brand ? `&brand=${encodeURIComponent(brand.brand_name)}` : "";
    return Response.redirect(`${base}/radar/welcome.html?status=ok${brandParam}`, 302);
  } catch {
    return fail("server-error");
  }
};
