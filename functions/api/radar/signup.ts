import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import {
  corsPreflightResponse,
  errorResponse,
  jsonResponse,
  requireDatabaseUrl,
  requirePostmarkToken,
  requireRadarSecret,
} from "../../lib/env.js";
import { sendPostmarkEmail } from "../../lib/postmark.js";
import {
  brandFromDomain,
  buildVerifyEmail,
  checkSignupRateLimits,
  createVerifyToken,
  hashIp,
  hashPassword,
  isWorkEmail,
  logSignupEvent,
  normalizeDomain,
  radarFromEmail,
  TRIAL_DAYS,
  WORK_EMAIL_REQUIRED_MSG,
} from "../../lib/radar.js";

interface SignupBody {
  domain?: string;
  name?: string;
  email?: string;
  password?: string;
  prompts?: string[];
  competitors?: string[];
  timezone?: string;
  plan?: string;
}

const MAX_PROMPTS = 50;
const MAX_COMPETITORS = 10;

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => corsPreflightResponse(request);

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: SignupBody;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return errorResponse("Invalid JSON body", 400, request);
  }

  // --- validate input ---
  const domain = normalizeDomain(body.domain ?? "");
  if (!domain) return errorResponse("Enter a valid domain, e.g. acme.com", 400, request);

  const name = (body.name ?? "").trim();
  if (name.length < 2) return errorResponse("Please enter your name", 400, request);

  const email = (body.email ?? "").trim().toLowerCase();
  if (!isWorkEmail(email)) return errorResponse(WORK_EMAIL_REQUIRED_MSG, 400, request);

  const password = body.password ?? "";
  if (password.length < 8) return errorResponse("Password must be at least 8 characters", 400, request);

  const prompts = (Array.isArray(body.prompts) ? body.prompts : [])
    .map((p) => String(p).trim())
    .filter(Boolean)
    .slice(0, MAX_PROMPTS);
  if (prompts.length === 0) return errorResponse("Pick at least one prompt to track", 400, request);

  const competitors = (Array.isArray(body.competitors) ? body.competitors : [])
    .map((c) => String(c).trim())
    .filter(Boolean)
    .slice(0, MAX_COMPETITORS);

  const timezone = (body.timezone ?? "America/New_York").trim() || "America/New_York";
  // Tier the user signed up for. Both start as a 7-day trial; plan drives report depth.
  const plan = body.plan === "free" ? "free" : "pro_trial";

  // --- secrets / config ---
  const secret = requireRadarSecret(env);
  if (secret instanceof Response) return secret;
  const postmarkToken = requirePostmarkToken(env);
  if (postmarkToken instanceof Response) return postmarkToken;

  const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  const ipHash = ip ? await hashIp(ip, secret) : null;
  const userAgent = request.headers.get("User-Agent");

  try {
    const sql = getSql(requireDatabaseUrl(env));

    // --- rate limit / abuse control ---
    const rateError = await checkSignupRateLimits(sql, email, ipHash);
    if (rateError) {
      await logSignupEvent(sql, { email, event: "blocked", detail: rateError, ipHash, userAgent });
      return errorResponse(rateError, 429, request);
    }

    // --- dedupe: an already-verified account shouldn't silently re-signup ---
    const existing = await sql`SELECT id, status FROM radar_accounts WHERE email = ${email} LIMIT 1`;
    if (existing.length && (existing[0].status as string) === "active") {
      return errorResponse("An account with this email already exists. Try signing in.", 409, request);
    }

    // --- create account (pending verification) ---
    const { hash, salt } = await hashPassword(password);
    const brand = brandFromDomain(domain);

    const accountRows = existing.length
      ? await sql`
          UPDATE radar_accounts
          SET full_name = ${name}, password_hash = ${hash}, password_salt = ${salt}, plan = ${plan},
              trial_started_at = NOW(), trial_ends_at = NOW() + (${TRIAL_DAYS} || ' days')::interval,
              status = 'pending_verification', signup_ip_hash = ${ipHash}, signup_user_agent = ${userAgent}
          WHERE id = ${existing[0].id}
          RETURNING id`
      : await sql`
          INSERT INTO radar_accounts (email, full_name, password_hash, password_salt, plan, trial_ends_at, signup_ip_hash, signup_user_agent)
          VALUES (${email}, ${name}, ${hash}, ${salt}, ${plan}, NOW() + (${TRIAL_DAYS} || ' days')::interval, ${ipHash}, ${userAgent})
          RETURNING id`;
    const accountId = accountRows[0].id as string;

    // --- (re)create the brand + config for a clean pending state ---
    await sql`DELETE FROM radar_brands WHERE account_id = ${accountId}`;
    const brandRows = await sql`
      INSERT INTO radar_brands (account_id, domain, brand_name, timezone)
      VALUES (${accountId}, ${domain}, ${brand}, ${timezone})
      RETURNING id`;
    const brandId = brandRows[0].id as string;

    for (const p of prompts) {
      await sql`INSERT INTO radar_tracked_prompts (brand_id, prompt_text) VALUES (${brandId}, ${p})`;
    }
    for (const c of competitors) {
      await sql`INSERT INTO radar_competitors (brand_id, competitor_name) VALUES (${brandId}, ${c})`;
    }

    // --- send verification email (double opt-in) ---
    const token = await createVerifyToken(accountId, secret);
    const base = (env.PUBLIC_BASE_URL?.trim() || new URL(request.url).origin).replace(/\/$/, "");
    const verifyUrl = `${base}/api/radar/verify?token=${encodeURIComponent(token)}`;
    const { text, html } = buildVerifyEmail(name, brand, verifyUrl);

    const result = await sendPostmarkEmail({
      token: postmarkToken,
      from: `RevForge Radar <${radarFromEmail(env.RADAR_FROM_EMAIL)}>`,
      to: email,
      subject: "Confirm your email to start your RevForge Radar trial",
      textBody: text,
      htmlBody: html,
    });

    await logSignupEvent(sql, { email, event: "signup_requested", detail: domain, ipHash, userAgent });
    await logSignupEvent(sql, { email, event: "verification_sent", detail: result.messageId, ipHash, userAgent });

    return jsonResponse({ ok: true, message: "Check your email to confirm your trial.", brand, prompts: prompts.length }, 200, request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signup failed";
    return errorResponse(message, 500, request);
  }
};
