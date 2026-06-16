import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { corsPreflightResponse, errorResponse, jsonResponse, requireDatabaseUrl } from "../../lib/env.js";
import { requireUser } from "../../lib/radar-user.js";
import { PROMPT_STAGES, planLabel, promptLimitFor } from "../../lib/radar-tiers.js";

// Manage the signed-in user's tracked prompts, honoring the per-plan cap
// (Free = 15, Pro = 50). The scan only ever runs the first N active prompts,
// so this is where users keep their set within — and up to — the limit.

const MIN_LEN = 5;
const MAX_LEN = 300;

type Brand = { brand_id: string; plan: string };

async function resolveBrand(sql: ReturnType<typeof getSql>, aid: string): Promise<Brand | null> {
  const rows = await sql`
    SELECT a.plan, b.id AS brand_id
    FROM radar_accounts a
    LEFT JOIN LATERAL (SELECT id FROM radar_brands WHERE account_id = a.id ORDER BY created_at LIMIT 1) b ON true
    WHERE a.id = ${aid} LIMIT 1`;
  if (!rows.length || !rows[0].brand_id) return null;
  return { brand_id: rows[0].brand_id as string, plan: rows[0].plan as string };
}

async function activeCount(sql: ReturnType<typeof getSql>, brandId: string): Promise<number> {
  const r = await sql`SELECT COUNT(*)::int AS n FROM radar_tracked_prompts WHERE brand_id = ${brandId} AND active`;
  return (r[0]?.n as number) ?? 0;
}

function cleanText(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}
function cleanStage(v: unknown): string {
  const s = String(v ?? "").toLowerCase().trim();
  return (PROMPT_STAGES as readonly string[]).includes(s) ? s : "discover";
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => corsPreflightResponse(request);

// GET — list prompts + the plan's cap and current usage.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const aid = await requireUser(request, env);
  if (aid instanceof Response) return aid;
  try {
    const sql = getSql(requireDatabaseUrl(env));
    const brand = await resolveBrand(sql, aid);
    if (!brand) return errorResponse("No brand found for this account", 404, request);
    const limit = promptLimitFor(brand.plan);
    const prompts = await sql`
      SELECT id, prompt_text, stage, active
      FROM radar_tracked_prompts WHERE brand_id = ${brand.brand_id}
      ORDER BY active DESC, created_at, id`;
    const used = prompts.filter((p: any) => p.active).length;
    return jsonResponse({ ok: true, plan: brand.plan, plan_label: planLabel(brand.plan), limit, used, prompts }, 200, request);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Failed to load prompts", 500, request);
  }
};

// POST — add a prompt (rejected when the active set is already at the cap).
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const aid = await requireUser(request, env);
  if (aid instanceof Response) return aid;

  let body: { prompt_text?: string; stage?: string };
  try { body = (await request.json()) as typeof body; } catch { return errorResponse("Invalid JSON body", 400, request); }
  const text = cleanText(body.prompt_text);
  const stage = cleanStage(body.stage);
  if (text.length < MIN_LEN) return errorResponse("Prompt is too short — write the question a buyer would actually ask", 400, request);
  if (text.length > MAX_LEN) return errorResponse(`Keep prompts under ${MAX_LEN} characters`, 400, request);

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const brand = await resolveBrand(sql, aid);
    if (!brand) return errorResponse("No brand found for this account", 404, request);
    const limit = promptLimitFor(brand.plan);
    const used = await activeCount(sql, brand.brand_id);
    if (used >= limit) {
      const msg = brand.plan === "free"
        ? `You've reached the Free plan limit of ${limit} active prompts. Upgrade to Pro to track up to 50.`
        : `You've reached your plan limit of ${limit} active prompts. Remove or deactivate one to add another.`;
      return errorResponse(msg, 409, request);
    }
    const dup = await sql`SELECT 1 FROM radar_tracked_prompts WHERE brand_id = ${brand.brand_id} AND lower(prompt_text) = lower(${text}) LIMIT 1`;
    if (dup.length) return errorResponse("You're already tracking that prompt", 409, request);
    const rows = await sql`
      INSERT INTO radar_tracked_prompts (brand_id, prompt_text, stage)
      VALUES (${brand.brand_id}, ${text}, ${stage})
      RETURNING id, prompt_text, stage, active`;
    return jsonResponse({ ok: true, prompt: rows[0], used: used + 1, limit }, 201, request);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Failed to add prompt", 500, request);
  }
};

// PATCH — edit text/stage or toggle active (re-activating respects the cap).
export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const aid = await requireUser(request, env);
  if (aid instanceof Response) return aid;

  let body: { id?: string; prompt_text?: string; stage?: string; active?: boolean };
  try { body = (await request.json()) as typeof body; } catch { return errorResponse("Invalid JSON body", 400, request); }
  const id = String(body.id ?? "").trim();
  if (!id) return errorResponse("Missing prompt id", 400, request);

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const brand = await resolveBrand(sql, aid);
    if (!brand) return errorResponse("No brand found for this account", 404, request);
    const owned = await sql`SELECT id, active FROM radar_tracked_prompts WHERE id = ${id} AND brand_id = ${brand.brand_id} LIMIT 1`;
    if (!owned.length) return errorResponse("Prompt not found", 404, request);

    const text = body.prompt_text != null ? cleanText(body.prompt_text) : undefined;
    const stage = body.stage != null ? cleanStage(body.stage) : undefined;
    const active = typeof body.active === "boolean" ? body.active : undefined;
    if (text != null && text.length < MIN_LEN) return errorResponse("Prompt is too short", 400, request);
    if (text != null && text.length > MAX_LEN) return errorResponse(`Keep prompts under ${MAX_LEN} characters`, 400, request);

    if (active === true && owned[0].active === false) {
      const limit = promptLimitFor(brand.plan);
      const used = await activeCount(sql, brand.brand_id);
      if (used >= limit) return errorResponse(`Re-activating exceeds your plan limit of ${limit} active prompts`, 409, request);
    }
    const rows = await sql`
      UPDATE radar_tracked_prompts
      SET prompt_text = COALESCE(${text ?? null}, prompt_text),
          stage       = COALESCE(${stage ?? null}, stage),
          active      = COALESCE(${active ?? null}, active)
      WHERE id = ${id} AND brand_id = ${brand.brand_id}
      RETURNING id, prompt_text, stage, active`;
    return jsonResponse({ ok: true, prompt: rows[0], used: await activeCount(sql, brand.brand_id), limit: promptLimitFor(brand.plan) }, 200, request);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Failed to update prompt", 500, request);
  }
};

// DELETE — remove a prompt (id in JSON body or ?id= query).
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const aid = await requireUser(request, env);
  if (aid instanceof Response) return aid;

  let id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) { try { id = String(((await request.json()) as { id?: string }).id ?? ""); } catch { /* no body */ } }
  id = id.trim();
  if (!id) return errorResponse("Missing prompt id", 400, request);

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const brand = await resolveBrand(sql, aid);
    if (!brand) return errorResponse("No brand found for this account", 404, request);
    const rows = await sql`DELETE FROM radar_tracked_prompts WHERE id = ${id} AND brand_id = ${brand.brand_id} RETURNING id`;
    if (!rows.length) return errorResponse("Prompt not found", 404, request);
    return jsonResponse({ ok: true, used: await activeCount(sql, brand.brand_id), limit: promptLimitFor(brand.plan) }, 200, request);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Failed to delete prompt", 500, request);
  }
};
