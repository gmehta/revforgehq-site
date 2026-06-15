import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { corsPreflightResponse, errorResponse, jsonResponse, requireDatabaseUrl, requireRadarSecret } from "../../lib/env.js";
import { hashPassword, logSignupEvent, readResetToken } from "../../lib/radar.js";

interface ResetBody {
  token?: string;
  password?: string;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => corsPreflightResponse(request);

// POST /api/radar/reset { token, password } → validates the signed reset token,
// confirms it still matches the current password hash (single-use), sets the new
// password, and activates the account if it was still pending.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secret = requireRadarSecret(env);
  if (secret instanceof Response) return secret;

  let body: ResetBody;
  try {
    body = (await request.json()) as ResetBody;
  } catch {
    return errorResponse("Invalid JSON body", 400, request);
  }
  const token = (body.token ?? "").trim();
  const password = (body.password ?? "").toString();
  if (!token) return errorResponse("This reset link is invalid.", 400, request);
  if (password.length < 8) return errorResponse("Password must be at least 8 characters", 400, request);

  const parsed = await readResetToken(token, secret);
  if (!parsed) return errorResponse("This reset link has expired or is invalid. Request a new one.", 401, request);

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const rows = await sql`SELECT id, email, password_hash, status FROM radar_accounts WHERE id = ${parsed.aid} LIMIT 1`;
    const account = rows[0] as { id: string; email: string; password_hash: string; status: string } | undefined;
    if (!account) return errorResponse("Account not found", 404, request);

    // Single-use: the token was bound to the password hash at issue time.
    if (account.password_hash.slice(0, 12) !== parsed.h) {
      return errorResponse("This reset link has already been used. Request a new one.", 401, request);
    }

    const { hash, salt } = await hashPassword(password);
    await sql`UPDATE radar_accounts SET password_hash = ${hash}, password_salt = ${salt} WHERE id = ${account.id}`;
    await logSignupEvent(sql, { email: account.email, event: "password_reset", detail: null });

    return jsonResponse({ ok: true }, 200, request);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Reset failed", 500, request);
  }
};
