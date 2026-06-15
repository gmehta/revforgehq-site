import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { corsPreflightResponse, errorResponse, JSON_HEADERS, requireDatabaseUrl } from "../../lib/env.js";
import { hashPassword, isValidEmail, timingSafeEqual } from "../../lib/radar.js";
import { createUserSession, userSessionCookie } from "../../lib/radar-user.js";

interface LoginBody {
  email?: string;
  password?: string;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => corsPreflightResponse(request);

// POST /api/radar/login  { email, password } → sets HttpOnly user session cookie.
// Only verified (status='active') accounts can sign in.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secret = env.RADAR_TOKEN_SECRET?.trim();
  if (!secret) return errorResponse("RADAR_TOKEN_SECRET is not configured", 503, request);

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return errorResponse("Invalid JSON body", 400, request);
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const password = (body.password ?? "").toString();
  if (!isValidEmail(email) || password.length < 1) {
    return errorResponse("Invalid email or password", 401, request);
  }

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const rows = await sql`
      SELECT id, password_hash, password_salt, status
      FROM radar_accounts WHERE email = ${email} LIMIT 1`;

    // Always run the hash to keep timing uniform whether or not the email exists.
    const account = rows[0] as { id: string; password_hash: string; password_salt: string; status: string } | undefined;
    const salt = account?.password_salt ?? "AAAAAAAAAAAAAAAAAAAAAA";
    const { hash } = await hashPassword(password, salt);
    const ok = account ? timingSafeEqual(hash, account.password_hash) : false;

    if (!account || !ok) return errorResponse("Invalid email or password", 401, request);
    if (account.status !== "active") {
      return errorResponse("Please confirm your email before signing in. Check your inbox for the confirmation link.", 403, request);
    }

    const token = await createUserSession(account.id, secret);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...JSON_HEADERS, "Set-Cookie": userSessionCookie(token) },
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Login failed", 500, request);
  }
};
