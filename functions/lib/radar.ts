import type { Sql } from "./db.js";
// Reuse the hardened helpers already shipped for the scan gate.
export { isWorkEmail, isValidEmail, hashIp, timingSafeEqual, WORK_EMAIL_REQUIRED_MSG } from "./scan-gate.js";

export const RADAR_FROM_EMAIL_DEFAULT = "gaurav@revforgehq.com";
export const RADAR_OWNER_EMAIL = "gaurav@revforgehq.com"; // internal new-trial notifications
export const TRIAL_DAYS = 7;

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // verification link valid 24h
// Cloudflare Workers' Web Crypto caps PBKDF2 at 100k iterations (hard platform limit).
const PBKDF2_ITERATIONS = 100_000;

const MAX_SIGNUPS_PER_EMAIL_DAY = 3;
const MAX_SIGNUPS_PER_IP_HOUR = 8;

export function radarFromEmail(envFrom?: string): string {
  return envFrom?.trim() || RADAR_FROM_EMAIL_DEFAULT;
}

// --- domain / brand helpers -------------------------------------------------
const DOMAIN_RE = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/i;

export function normalizeDomain(raw: string): string | null {
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  return DOMAIN_RE.test(d) ? d : null;
}

export function brandFromDomain(domain: string): string {
  const root = domain.split(".")[0] ?? domain;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

// --- password hashing (PBKDF2-SHA256, Web Crypto) ---------------------------
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? b64urlToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return { hash: b64url(new Uint8Array(bits)), salt: b64url(salt) };
}

// --- signed verification token (HMAC-SHA256, stateless) ---------------------
async function hmac(data: string, secret: string, mode: "sign" | "verify", sig?: Uint8Array): Promise<string | boolean> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [mode]);
  const enc = new TextEncoder().encode(data);
  if (mode === "sign") return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc)));
  return crypto.subtle.verify("HMAC", key, sig!, enc);
}

interface VerifyPayload {
  aid: string; // account id
  exp: number;
}

export async function createVerifyToken(accountId: string, secret: string): Promise<string> {
  const payload: VerifyPayload = { aid: accountId, exp: Date.now() + VERIFY_TTL_MS };
  const data = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = (await hmac(data, secret, "sign")) as string;
  return `${data}.${sig}`;
}

export async function readVerifyToken(token: string, secret: string): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const data = token.slice(0, dot);
  const ok = (await hmac(data, secret, "verify", b64urlToBytes(token.slice(dot + 1)))) as boolean;
  if (!ok) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(b64urlToBytes(data))) as VerifyPayload;
    if (typeof p.exp !== "number" || p.exp < Date.now() || !p.aid) return null;
    return p.aid;
  } catch {
    return null;
  }
}

// --- rate limiting (mirrors scan-gate; reads from radar_signup_events) -------
export async function checkSignupRateLimits(sql: Sql, email: string, ipHash: string | null): Promise<string | null> {
  const e = await sql`
    SELECT COUNT(*)::int AS c FROM radar_signup_events
    WHERE email = ${email} AND event = 'signup_requested'
      AND created_at > NOW() - INTERVAL '1 day'`;
  if ((e[0]?.c as number) >= MAX_SIGNUPS_PER_EMAIL_DAY) {
    return "This email has already started a trial today. Check your inbox for the confirmation link.";
  }
  if (ipHash) {
    const i = await sql`
      SELECT COUNT(*)::int AS c FROM radar_signup_events
      WHERE ip_hash = ${ipHash} AND event = 'signup_requested'
        AND created_at > NOW() - INTERVAL '1 hour'`;
    if ((i[0]?.c as number) >= MAX_SIGNUPS_PER_IP_HOUR) {
      return "Too many signups from this network. Please try again later.";
    }
  }
  return null;
}

export async function logSignupEvent(
  sql: Sql,
  input: { email: string | null; event: string; detail?: string | null; ipHash?: string | null; userAgent?: string | null },
): Promise<void> {
  await sql`
    INSERT INTO radar_signup_events (email, event, detail, ip_hash, user_agent)
    VALUES (${input.email}, ${input.event}, ${input.detail ?? null}, ${input.ipHash ?? null}, ${input.userAgent ?? null})`;
}

// --- email bodies -----------------------------------------------------------
export function buildVerifyEmail(name: string, brand: string, verifyUrl: string): { text: string; html: string } {
  const first = name.split(" ")[0] || "there";
  const text = [
    `Hi ${first},`,
    "",
    `Welcome to RevForge Radar. Confirm your email to start your 7-day Pro trial and kick off the first AI-visibility scan for ${brand}:`,
    "",
    verifyUrl,
    "",
    "This link is valid for 24 hours. If you didn't request this, you can ignore this email.",
    "",
    "— The RevForgeHQ team",
  ].join("\n");
  const html = `<!DOCTYPE html><html><body style="font-family:Inter,system-ui,sans-serif;color:#1a1a1a;line-height:1.55;max-width:520px;margin:auto">
<p>Hi ${first},</p>
<p>Welcome to <strong>RevForge Radar</strong>. Confirm your email to start your <strong>7-day Pro trial</strong> and kick off the first AI-visibility scan for <strong>${brand}</strong>.</p>
<p style="margin:28px 0"><a href="${verifyUrl}" style="background:#ff6b35;color:#1a0e06;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;display:inline-block">Confirm &amp; start my trial →</a></p>
<p style="color:#666;font-size:13px">Or paste this link into your browser:<br><a href="${verifyUrl}" style="color:#c2410c">${verifyUrl}</a></p>
<p style="color:#666;font-size:13px">This link is valid for 24 hours. If you didn't request this, ignore this email.</p>
<p style="color:#666;font-size:13px">— The RevForgeHQ team</p>
</body></html>`;
  return { text, html };
}

export function buildOwnerNotifyEmail(account: { email: string; name: string }, brand: { brand: string; domain: string; prompts: number; competitors: number }): { text: string; html: string } {
  const text = [
    `New RevForge Radar trial (verified):`,
    `  Name:        ${account.name}`,
    `  Email:       ${account.email}`,
    `  Brand:       ${brand.brand} (${brand.domain})`,
    `  Prompts:     ${brand.prompts}`,
    `  Competitors: ${brand.competitors}`,
    "",
    `A first_scan job is queued. Run the pipeline for ${brand.domain} so the report lands before their morning.`,
  ].join("\n");
  const html = `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px">${text.replace(/</g, "&lt;")}</pre>`;
  return { text, html };
}
