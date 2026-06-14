import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import {
  corsPreflightResponse,
  errorResponse,
  jsonResponse,
  requireDatabaseUrl,
  requirePostmarkToken,
  requireScanGateSecrets,
} from "../../lib/env.js";
import { sendPostmarkEmail } from "../../lib/postmark.js";
import {
  buildPasswordEmailBodies,
  checkPasswordEmailRateLimits,
  hashIp,
  isAllowedSlug,
  isWorkEmail,
  WORK_EMAIL_REQUIRED_MSG,
  logScanGateAccess,
  scanGateFromEmail,
} from "../../lib/scan-gate.js";

interface RequestPasswordBody {
  email?: string;
  slug?: string;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  return corsPreflightResponse(request);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === "OPTIONS") {
    return corsPreflightResponse(request);
  }

  let body: RequestPasswordBody;
  try {
    body = (await request.json()) as RequestPasswordBody;
  } catch {
    return errorResponse("Invalid JSON body", 400, request);
  }

  const email = body.email?.trim().toLowerCase();
  const slug = body.slug?.trim().toLowerCase();

  if (!email || !isWorkEmail(email)) {
    return errorResponse(WORK_EMAIL_REQUIRED_MSG, 400, request);
  }
  if (!slug || !isAllowedSlug(slug)) {
    return errorResponse("Invalid report", 400, request);
  }

  const secrets = requireScanGateSecrets(env);
  if (secrets instanceof Response) return secrets;

  const postmarkToken = requirePostmarkToken(env);
  if (postmarkToken instanceof Response) return postmarkToken;

  const fromEmail = scanGateFromEmail(env.SCAN_GATE_FROM_EMAIL);
  const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  const ipHash = ip ? await hashIp(ip, secrets.tokenSecret) : null;
  const userAgent = request.headers.get("User-Agent");

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const rateError = await checkPasswordEmailRateLimits(sql, email, slug, ipHash);
    if (rateError) {
      return errorResponse(rateError, 429, request);
    }

    const { text, html } = buildPasswordEmailBodies(secrets.password, slug);
    const result = await sendPostmarkEmail({
      token: postmarkToken,
      from: `RevForgeHQ <${fromEmail}>`,
      to: email,
      subject: "Your RevForge scan access password",
      textBody: text,
      htmlBody: html,
    });

    await logScanGateAccess(sql, {
      email,
      scanSlug: slug,
      unlockMethod: "password_email_requested",
      postmarkMessageId: result.messageId,
      ipHash,
      userAgent,
    });

    return jsonResponse({ ok: true, message: "Password sent" }, 200, request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send password";
    return errorResponse(message, 500, request);
  }
};
