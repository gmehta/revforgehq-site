import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import {
  corsPreflightResponse,
  errorResponse,
  jsonResponse,
  requireDatabaseUrl,
  requireScanGateSecrets,
} from "../../lib/env.js";
import {
  createUnlockToken,
  hashIp,
  isAllowedSlug,
  isWorkEmail,
  WORK_EMAIL_REQUIRED_MSG,
  logScanGateAccess,
  timingSafeEqual,
  verifyUnlockToken,
} from "../../lib/scan-gate.js";

interface VerifyBody {
  slug?: string;
  password?: string;
  email?: string;
  token?: string;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  return corsPreflightResponse(request);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === "OPTIONS") {
    return corsPreflightResponse(request);
  }

  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return errorResponse("Invalid JSON body", 400, request);
  }

  const slug = body.slug?.trim().toLowerCase();
  if (!slug || !isAllowedSlug(slug)) {
    return errorResponse("Invalid report", 400, request);
  }

  const secrets = requireScanGateSecrets(env);
  if (secrets instanceof Response) return secrets;

  const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  const ipHash = ip ? await hashIp(ip, secrets.tokenSecret) : null;
  const userAgent = request.headers.get("User-Agent");

  try {
    const sql = getSql(requireDatabaseUrl(env));

    if (body.token?.trim()) {
      const valid = await verifyUnlockToken(body.token.trim(), slug, secrets.tokenSecret);
      if (!valid) {
        return errorResponse("Unlock expired or invalid", 401, request);
      }
      return jsonResponse({ ok: true, token: body.token.trim(), slug }, 200, request);
    }

    const password = body.password?.trim();
    if (!password) {
      return errorResponse("Password is required", 400, request);
    }
    if (!timingSafeEqual(password, secrets.password)) {
      return errorResponse("Incorrect password", 401, request);
    }

    const email = body.email?.trim().toLowerCase();
    if (email) {
      if (!isWorkEmail(email)) {
        return errorResponse(WORK_EMAIL_REQUIRED_MSG, 400, request);
      }
      await logScanGateAccess(sql, {
        email,
        scanSlug: slug,
        unlockMethod: "email_password",
        ipHash,
        userAgent,
      });
    } else {
      await logScanGateAccess(sql, {
        email: null,
        scanSlug: slug,
        unlockMethod: "password",
        ipHash,
        userAgent,
      });
    }

    const unlocked = await createUnlockToken(slug, secrets.tokenSecret);
    return jsonResponse({ ok: true, ...unlocked, slug }, 200, request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return errorResponse(message, 500, request);
  }
};
