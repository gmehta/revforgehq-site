import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { corsPreflightResponse, errorResponse, jsonResponse, requireDatabaseUrl, requirePostmarkToken, requireRadarSecret } from "../../lib/env.js";
import { sendPostmarkEmail } from "../../lib/postmark.js";
import { buildVerifyEmail, createVerifyToken, isValidEmail, logSignupEvent, radarFromEmail } from "../../lib/radar.js";

interface ResendBody {
  email?: string;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => corsPreflightResponse(request);

// POST /api/radar/resend { email } → re-sends the confirmation email if the
// account is still pending verification. Generic response (no existence leak).
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secret = requireRadarSecret(env);
  if (secret instanceof Response) return secret;
  const postmarkToken = requirePostmarkToken(env);
  if (postmarkToken instanceof Response) return postmarkToken;

  let body: ResendBody;
  try {
    body = (await request.json()) as ResendBody;
  } catch {
    return errorResponse("Invalid JSON body", 400, request);
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const generic = jsonResponse({ ok: true, message: "If that account still needs confirming, a new link is on its way." }, 200, request);
  if (!isValidEmail(email)) return generic;

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const rows = await sql`
      SELECT a.id, a.full_name, a.status, b.brand_name
      FROM radar_accounts a
      LEFT JOIN LATERAL (SELECT brand_name FROM radar_brands WHERE account_id = a.id ORDER BY created_at LIMIT 1) b ON true
      WHERE a.email = ${email} LIMIT 1`;
    const account = rows[0] as { id: string; full_name: string; status: string; brand_name: string | null } | undefined;

    if (account && account.status === "pending_verification") {
      const token = await createVerifyToken(account.id, secret);
      const base = (env.PUBLIC_BASE_URL?.trim() || new URL(request.url).origin).replace(/\/$/, "");
      const verifyUrl = `${base}/radar/confirm?token=${encodeURIComponent(token)}`;
      const { text, html } = buildVerifyEmail(account.full_name ?? "", account.brand_name ?? "your brand", verifyUrl);
      try {
        const result = await sendPostmarkEmail({
          token: postmarkToken,
          from: `RevForgeHQ Radar <${radarFromEmail(env.RADAR_FROM_EMAIL)}>`,
          to: email,
          subject: "Confirm your email to start your RevForgeHQ Radar trial",
          textBody: text,
          htmlBody: html,
        });
        await logSignupEvent(sql, { email, event: "verification_resent", detail: result.messageId });
      } catch {
        /* best-effort */
      }
    }
    return generic;
  } catch {
    return generic;
  }
};
