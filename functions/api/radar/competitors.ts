import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { corsPreflightResponse, errorResponse, jsonResponse, requireDatabaseUrl } from "../../lib/env.js";
import { requireUser } from "../../lib/radar-user.js";
import { MAX_COMPETITORS } from "../../lib/radar-tiers.js";

// Manage the signed-in user's tracked competitors (capped at MAX_COMPETITORS).
// Better competitor coverage directly improves share-of-voice + teardown depth.

type Brand = { brand_id: string };

async function resolveBrand(sql: ReturnType<typeof getSql>, aid: string): Promise<Brand | null> {
  const rows = await sql`
    SELECT b.id AS brand_id
    FROM radar_accounts a
    LEFT JOIN LATERAL (SELECT id FROM radar_brands WHERE account_id = a.id ORDER BY created_at LIMIT 1) b ON true
    WHERE a.id = ${aid} LIMIT 1`;
  if (!rows.length || !rows[0].brand_id) return null;
  return { brand_id: rows[0].brand_id as string };
}

function cleanName(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}
function cleanDomain(v: unknown): string | null {
  const d = String(v ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => corsPreflightResponse(request);

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const aid = await requireUser(request, env);
  if (aid instanceof Response) return aid;
  try {
    const sql = getSql(requireDatabaseUrl(env));
    const brand = await resolveBrand(sql, aid);
    if (!brand) return errorResponse("No brand found for this account", 404, request);
    const competitors = await sql`
      SELECT id, competitor_name, competitor_domain
      FROM radar_competitors WHERE brand_id = ${brand.brand_id} ORDER BY created_at, id`;
    return jsonResponse({ ok: true, limit: MAX_COMPETITORS, used: competitors.length, competitors }, 200, request);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Failed to load competitors", 500, request);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const aid = await requireUser(request, env);
  if (aid instanceof Response) return aid;

  let body: { competitor_name?: string; competitor_domain?: string };
  try { body = (await request.json()) as typeof body; } catch { return errorResponse("Invalid JSON body", 400, request); }
  const name = cleanName(body.competitor_name);
  const domain = cleanDomain(body.competitor_domain);
  if (name.length < 2) return errorResponse("Enter a competitor name", 400, request);
  if (name.length > 80) return errorResponse("Competitor name is too long", 400, request);

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const brand = await resolveBrand(sql, aid);
    if (!brand) return errorResponse("No brand found for this account", 404, request);
    const used = (await sql`SELECT COUNT(*)::int AS n FROM radar_competitors WHERE brand_id = ${brand.brand_id}`)[0].n as number;
    if (used >= MAX_COMPETITORS) return errorResponse(`You can track up to ${MAX_COMPETITORS} competitors. Remove one to add another.`, 409, request);
    const dup = await sql`SELECT 1 FROM radar_competitors WHERE brand_id = ${brand.brand_id} AND lower(competitor_name) = lower(${name}) LIMIT 1`;
    if (dup.length) return errorResponse("That competitor is already tracked", 409, request);
    const rows = await sql`
      INSERT INTO radar_competitors (brand_id, competitor_name, competitor_domain)
      VALUES (${brand.brand_id}, ${name}, ${domain})
      RETURNING id, competitor_name, competitor_domain`;
    return jsonResponse({ ok: true, competitor: rows[0], used: used + 1, limit: MAX_COMPETITORS }, 201, request);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Failed to add competitor", 500, request);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const aid = await requireUser(request, env);
  if (aid instanceof Response) return aid;

  let id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) { try { id = String(((await request.json()) as { id?: string }).id ?? ""); } catch { /* no body */ } }
  id = id.trim();
  if (!id) return errorResponse("Missing competitor id", 400, request);

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const brand = await resolveBrand(sql, aid);
    if (!brand) return errorResponse("No brand found for this account", 404, request);
    const rows = await sql`DELETE FROM radar_competitors WHERE id = ${id} AND brand_id = ${brand.brand_id} RETURNING id`;
    if (!rows.length) return errorResponse("Competitor not found", 404, request);
    const used = (await sql`SELECT COUNT(*)::int AS n FROM radar_competitors WHERE brand_id = ${brand.brand_id}`)[0].n as number;
    return jsonResponse({ ok: true, used, limit: MAX_COMPETITORS }, 200, request);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Failed to delete competitor", 500, request);
  }
};
