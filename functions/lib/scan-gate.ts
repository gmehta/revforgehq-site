import type { Sql } from "./db.js";
import { emailDomain, isBlockedEmailDomain } from "./free-email-domains.js";

export const SCAN_GATE_FROM_EMAIL_DEFAULT = "gaurav@revforgehq.com";

export const ALLOWED_SCAN_SLUGS = new Set([
  "1password",
  "alo-yoga",
  "aviatrix",
  "beauty-by-imagination",
  "brivo",
  "clearco",
  "hashicorp",
  "miva",
  "optavia",
  "samsara",
  "superhuman",
  "thoughtspot",
  "wiz",
]);

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PASSWORD_EMAIL_PER_EMAIL_SLUG_HOUR = 3;
const MAX_PASSWORD_EMAIL_PER_IP_HOUR = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function scanGateFromEmail(envFrom?: string): string {
  const trimmed = envFrom?.trim();
  return trimmed || SCAN_GATE_FROM_EMAIL_DEFAULT;
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}

export const WORK_EMAIL_REQUIRED_MSG =
  "Please use your work email. Personal and disposable email providers are not accepted.";

export function isWorkEmail(email: string): boolean {
  if (!isValidEmail(email)) return false;
  const domain = emailDomain(email);
  if (!domain) return false;
  return !isBlockedEmailDomain(domain);
}

export function isAllowedSlug(slug: string): boolean {
  return ALLOWED_SCAN_SLUGS.has(slug);
}

export function slugDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function hashOtp(code: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(`${code}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlEncodeString(value: string): string {
  return b64urlEncode(new TextEncoder().encode(value));
}

function b64urlDecodeToString(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const padded = signature.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((signature.length + 3) % 4);
  const binary = atob(padded);
  const sigBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) sigBytes[i] = binary.charCodeAt(i);
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
}

export interface UnlockTokenPayload {
  slug: string;
  exp: number;
}

export async function createUnlockToken(slug: string, secret: string): Promise<{ token: string; expiresAt: string }> {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload: UnlockTokenPayload = { slug, exp };
  const data = b64urlEncodeString(JSON.stringify(payload));
  const sig = await hmacSign(data, secret);
  return { token: `${data}.${sig}`, expiresAt: new Date(exp).toISOString() };
}

export async function verifyUnlockToken(
  token: string,
  slug: string,
  secret: string,
): Promise<boolean> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!(await hmacVerify(data, sig, secret))) return false;
  try {
    const payload = JSON.parse(b64urlDecodeToString(data)) as UnlockTokenPayload;
    if (payload.slug !== slug) return false;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

export async function hashIp(ip: string, secret: string): Promise<string> {
  return hashOtp(ip, secret);
}

export async function checkPasswordEmailRateLimits(
  sql: Sql,
  email: string,
  slug: string,
  ipHash: string | null,
): Promise<string | null> {
  const emailRows = await sql`
    SELECT COUNT(*)::int AS c FROM scan_gate_access
    WHERE email = ${email}
      AND scan_slug = ${slug}
      AND unlock_method = 'password_email_requested'
      AND unlocked_at > NOW() - INTERVAL '1 hour'
  `;
  if ((emailRows[0]?.c as number) >= MAX_PASSWORD_EMAIL_PER_EMAIL_SLUG_HOUR) {
    return "Too many password requests for this email. Try again in an hour.";
  }
  if (ipHash) {
    const ipRows = await sql`
      SELECT COUNT(*)::int AS c FROM scan_gate_access
      WHERE ip_hash = ${ipHash}
        AND unlock_method = 'password_email_requested'
        AND unlocked_at > NOW() - INTERVAL '1 hour'
    `;
    if ((ipRows[0]?.c as number) >= MAX_PASSWORD_EMAIL_PER_IP_HOUR) {
      return "Too many requests from this network. Try again later.";
    }
  }
  return null;
}

export async function logScanGateAccess(
  sql: Sql,
  input: {
    email: string | null;
    scanSlug: string;
    unlockMethod: string;
    postmarkMessageId?: string | null;
    ipHash?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  await sql`
    INSERT INTO scan_gate_access (
      email, scan_slug, unlock_method, postmark_message_id, ip_hash, user_agent
    ) VALUES (
      ${input.email},
      ${input.scanSlug},
      ${input.unlockMethod},
      ${input.postmarkMessageId ?? null},
      ${input.ipHash ?? null},
      ${input.userAgent ?? null}
    )
  `;
}

export function buildPasswordEmailBodies(password: string, slug: string): { text: string; html: string } {
  const report = slugDisplayName(slug);
  const text = [
    `Your password to unlock the ${report} AI visibility scan: ${password}`,
    "",
    "Enter this password on the report page to view the full analysis.",
    "",
    "— RevForgeHQ",
  ].join("\n");
  const html = `<!DOCTYPE html><html><body style="font-family:Inter,system-ui,sans-serif;color:#1a1a1a;line-height:1.5">
<p>Your password to unlock the <strong>${report}</strong> AI visibility scan:</p>
<p style="font-size:22px;font-weight:700;margin:24px 0">${password}</p>
<p style="color:#666;font-size:14px">Enter this password on the report page to view the full analysis. If you didn't request this, ignore this email.</p>
<p style="color:#666;font-size:14px">— RevForgeHQ</p>
</body></html>`;
  return { text, html };
}
