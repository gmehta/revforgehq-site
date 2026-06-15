import type { Env } from "../../../lib/env.js";
import { errorResponse, JSON_HEADERS } from "../../../lib/env.js";
import { checkAdminCredentials, createAdminSession, sessionCookie } from "../../../lib/admin.js";

interface LoginBody {
  email?: string;
  password?: string;
}

// POST /api/radar/admin/login  { email, password } → sets HttpOnly session cookie.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secret = env.RADAR_TOKEN_SECRET?.trim();
  if (!secret) return errorResponse("RADAR_TOKEN_SECRET is not configured", 503);
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return errorResponse("Admin login is not configured", 503);

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const email = (body.email ?? "").toString();
  const password = (body.password ?? "").toString();
  if (!checkAdminCredentials(email, password, env)) {
    return errorResponse("Invalid email or password", 401);
  }

  const token = await createAdminSession(env.ADMIN_EMAIL.trim().toLowerCase(), secret);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...JSON_HEADERS, "Set-Cookie": sessionCookie(token) },
  });
};
