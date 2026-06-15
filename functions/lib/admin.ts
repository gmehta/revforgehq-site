import type { Env } from "./env.js";
import { errorResponse } from "./env.js";
import { timingSafeEqual } from "./scan-gate.js";

const COOKIE = "radar_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

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
async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))));
}

interface AdminPayload {
  email: string;
  exp: number;
}

export async function createAdminSession(email: string, secret: string): Promise<string> {
  const payload: AdminPayload = { email, exp: Date.now() + SESSION_TTL_MS };
  const data = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(`admin:${data}`, secret);
  return `${data}.${sig}`;
}

export async function readAdminSession(token: string, secret: string): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(`admin:${data}`, secret);
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(b64urlToBytes(data))) as AdminPayload;
    if (typeof p.exp !== "number" || p.exp < Date.now() || !p.email) return null;
    return p.email;
  } catch {
    return null;
  }
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}
export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Guard: returns the admin email, or a 401/503 Response. */
export async function requireAdmin(request: Request, env: Env): Promise<string | Response> {
  const secret = env.RADAR_TOKEN_SECRET?.trim();
  if (!secret) return errorResponse("RADAR_TOKEN_SECRET is not configured", 503);
  const token = getCookie(request, COOKIE);
  if (!token) return errorResponse("Not authenticated", 401);
  const email = await readAdminSession(token, secret);
  if (!email) return errorResponse("Session expired", 401);
  return email;
}

/** Validate posted credentials against the configured admin login (timing-safe). */
export function checkAdminCredentials(email: string, password: string, env: Env): boolean {
  const wantEmail = env.ADMIN_EMAIL?.trim().toLowerCase();
  const wantPw = env.ADMIN_PASSWORD ?? "";
  if (!wantEmail || !wantPw) return false;
  const emailOk = timingSafeEqual(email.trim().toLowerCase(), wantEmail);
  const pwOk = timingSafeEqual(password, wantPw);
  return emailOk && pwOk;
}
