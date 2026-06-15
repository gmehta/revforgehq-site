import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { corsPreflightResponse, errorResponse, jsonResponse, requireDatabaseUrl } from "../../lib/env.js";
import { hashPassword, timingSafeEqual } from "../../lib/radar.js";
import { requireUser } from "../../lib/radar-user.js";

// POST /api/radar/change-password { current_password, new_password } — for a
// signed-in user. Verifies the current password before setting the new one.
export const onRequestOptions: PagesFunction<Env> = async ({ request }) => corsPreflightResponse(request);

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const aid = await requireUser(request, env);
  if (aid instanceof Response) return aid;

  let body: { current_password?: string; new_password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid JSON body", 400, request);
  }
  const current = (body.current_password ?? "").toString();
  const next = (body.new_password ?? "").toString();
  if (next.length < 8) return errorResponse("New password must be at least 8 characters", 400, request);

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const rows = await sql`SELECT password_hash, password_salt FROM radar_accounts WHERE id = ${aid} LIMIT 1`;
    if (!rows.length) return errorResponse("Account not found", 404, request);
    const { password_hash, password_salt } = rows[0] as { password_hash: string; password_salt: string };

    const { hash } = await hashPassword(current, password_salt);
    if (!timingSafeEqual(hash, password_hash)) {
      return errorResponse("Your current password is incorrect", 401, request);
    }

    const next_ = await hashPassword(next);
    await sql`UPDATE radar_accounts SET password_hash = ${next_.hash}, password_salt = ${next_.salt} WHERE id = ${aid}`;
    return jsonResponse({ ok: true }, 200, request);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Failed to change password", 500, request);
  }
};
