import type { Ai } from "@cloudflare/workers-types";

export interface Env {
  DATABASE_URL: string;
  AI: Ai;
  DEMO_RATE_LIMIT?: string;
  POSTMARK_SERVER_TOKEN?: string;
  POSTMARK_FROM_EMAIL?: string;
  SCAN_GATE_PASSWORD?: string;
  SCAN_GATE_TOKEN_SECRET?: string;
  SCAN_GATE_FROM_EMAIL?: string;
  LEADS_API_KEY?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  CRM_SPREADSHEET_ID?: string;
  CRM_SHEET_LEADS?: string;
  CRM_SHEET_ACCOUNTS?: string;
  CRM_SHEET_OUTREACH?: string;
  NEWS_API_KEY?: string;
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

export function requirePostmarkToken(env: Env): string | Response {
  const token = env.POSTMARK_SERVER_TOKEN?.trim();
  if (!token) {
    return errorResponse("POSTMARK_SERVER_TOKEN is not configured", 503);
  }
  return token;
}

export function requireScanGateSecrets(env: Env): { password: string; tokenSecret: string } | Response {
  const password = env.SCAN_GATE_PASSWORD?.trim();
  const tokenSecret = env.SCAN_GATE_TOKEN_SECRET?.trim();
  if (!password || !tokenSecret) {
    return errorResponse("SCAN_GATE_PASSWORD and SCAN_GATE_TOKEN_SECRET must be configured", 503);
  }
  return { password, tokenSecret };
}

export const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
} as const;

/** Origins allowed to call demo APIs from static portfolio (GitHub Pages). */
const DEMO_CORS_ORIGINS = new Set([
  "https://gmehta.github.io",
  "https://www.revforgehq.com",
  "https://revforgehq.com",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8788",
  "http://127.0.0.1:8788",
]);

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin || !DEMO_CORS_ORIGINS.has(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function mergeResponseHeaders(
  request: Request | undefined,
  headers: Record<string, string> = JSON_HEADERS,
): Record<string, string> {
  return request ? { ...headers, ...corsHeaders(request) } : headers;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  request?: Request,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: mergeResponseHeaders(request),
  });
}

export function errorResponse(
  message: string,
  status = 500,
  request?: Request,
): Response {
  return jsonResponse({ ok: false, error: message }, status, request);
}

export function corsPreflightResponse(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: mergeResponseHeaders(request, {
      ...JSON_HEADERS,
      "Content-Length": "0",
    }),
  });
}
