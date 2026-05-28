import type { Ai } from "@cloudflare/workers-types";

export interface Env {
  DATABASE_URL: string;
  AI: Ai;
  DEMO_RATE_LIMIT?: string;
  POSTMARK_SERVER_TOKEN?: string;
  POSTMARK_FROM_EMAIL?: string;
  LEADS_API_KEY?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  CRM_SPREADSHEET_ID?: string;
  CRM_SHEET_LEADS?: string;
  CRM_SHEET_ACCOUNTS?: string;
}

export function requireDatabaseUrl(env: Env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  return url;
}

export function requireLeadsApiKey(request: Request, env: Env): string | Response {
  const expected = env.LEADS_API_KEY?.trim();
  if (!expected) {
    return errorResponse("LEADS_API_KEY is not configured", 503);
  }
  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== expected) {
    return errorResponse("Unauthorized", 401);
  }
  return expected;
}

export function requirePostmarkConfig(env: Env): { token: string; fromEmail: string } | Response {
  const token = env.POSTMARK_SERVER_TOKEN?.trim();
  const fromEmail = env.POSTMARK_FROM_EMAIL?.trim();
  if (!token || !fromEmail) {
    return errorResponse("POSTMARK_SERVER_TOKEN and POSTMARK_FROM_EMAIL must be configured", 503);
  }
  return { token, fromEmail };
}

export const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
} as const;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ ok: false, error: message }, status);
}
