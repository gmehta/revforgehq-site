import type { Env } from "../../lib/env.js";
import { JSON_HEADERS } from "../../lib/env.js";
import { clearUserCookie } from "../../lib/radar-user.js";

// POST /api/radar/logout → clears the user session cookie.
export const onRequestPost: PagesFunction<Env> = async () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...JSON_HEADERS, "Set-Cookie": clearUserCookie() },
  });
