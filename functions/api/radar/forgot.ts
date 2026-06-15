import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { corsPreflightResponse, errorResponse, jsonResponse, requireDatabaseUrl, requirePostmarkToken, requireRadarSecret } from "../../lib/env.js";
import { sendPostmarkEmail } from "../../lib/postmark.js";
import { buildResetEmail, createResetToken, isValidEmail, logSignupEvent, radarFromEmail } from "../../lib/radar.js";

interface ForgotBody {
  email?: string;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => corsPreflightResponse(request);

// POST /api/radar/forgot { email } → emails a password-reset link if the account
// exists. Always returns the same generic message (no account-existence leak).
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secret = requireRadarSecret(env);
  if (secret instanceof Response) return secret;
  const postmarkToken = requirePostmarkToken(env);
  if (postmarkToken instanceof Response) return postmarkToken;

  let body: ForgotBody;
  try {
    body = (await request.json()) as ForgotBody;
  } catch {
    return errorResponse("Invalid JSON body", 400, request);
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const generic = jsonResponse({ ok: true, message: "If that email has an account, a reset link is on its way." }, 200, request);
  if (!isValidEmail(email)) return generic;

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const rows = await sql`SELECT id, full_name, password_hash, status FROM radar_accounts WHERE email = ${email} LIMIT 1`;
    const account = rows[0] as { id: string; full_name: string; password_hash: string; status: string } | undefined;

    if (account && account.status !== "suspended") {
      const token = await createResetToken(account.id, account.password_hash.slice(0, 12), secret);
      const base = (env.PUBLIC_BASE_URL?.trim() || new URL(request.url).origin).replace(/\/$/, "");
      const resetUrl = `${base}/radar/reset?token=${encodeURIComponent(token)}`;
      const { text, html } = buildResetEmail(account.full_name ?? "", resetUrl);
      try {
        await sendPostmarkEmail({
          token: postmarkToken,
          from: `RevForgeHQ Radar <${radarFromEmail(env.RADAR_FROM_EMAIL)}>`,
          to: email,
          subject: "Reset your RevForgeHQ Radar password",
          textBody: text,
          htmlBody: html,
        });
        await logSignupEvent(sql, { email, event: "password_reset_requested", detail: null });
      } catch {
        /* best-effort; still return generic */
      }
    }
    return generic;
  } catch {
    return generic; // never leak; even on error the user sees the same message
  }
};
