import type { Env } from "../../../lib/env.js";
import { JSON_HEADERS } from "../../../lib/env.js";
import { clearCookie } from "../../../lib/admin.js";

// POST /api/radar/admin/logout → clears the session cookie.
export const onRequestPost: PagesFunction<Env> = async () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...JSON_HEADERS, "Set-Cookie": clearCookie() },
  });
