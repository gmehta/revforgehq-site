import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { requireDatabaseUrl } from "../../lib/env.js";

// GET /api/radar/report?id=<uuid>&t=<view_token>
// Serves a generated report's HTML behind an unguessable id + random view token
// (set by the offline runner). No public/guessable URLs.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deny(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "no-store" },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  const token = url.searchParams.get("t")?.trim() ?? "";

  if (!UUID_RE.test(id) || token.length < 16) return deny("Invalid report link.", 400);

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const rows = await sql`
      SELECT html FROM radar_reports
      WHERE id = ${id} AND view_token = ${token}
      LIMIT 1`;
    if (!rows.length) return deny("Report not found or link expired.", 404);

    return new Response(rows[0].html as string, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=300",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    return deny(err instanceof Error ? err.message : "Failed to load report", 500);
  }
};
