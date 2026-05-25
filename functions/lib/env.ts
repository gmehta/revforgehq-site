import type { Ai } from "@cloudflare/workers-types";

export interface Env {
  DATABASE_URL: string;
  AI: Ai;
  DEMO_RATE_LIMIT?: string;
}

export function requireDatabaseUrl(env: Env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  return url;
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
