import { getLatestNewsRun, runAccountNewsEnrich } from "../../lib/account-news-enrich.js";
import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import {
  errorResponse,
  jsonResponse,
  requireDatabaseUrl,
  requireLeadsApiKey,
} from "../../lib/env.js";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = requireLeadsApiKey(request, env);
  if (auth instanceof Response) return auth;

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const lastRun = await getLatestNewsRun(sql);
    return jsonResponse({ ok: true, lastRun });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read news enrich status";
    return errorResponse(message, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = requireLeadsApiKey(request, env);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const hoursParam = url.searchParams.get("hours");
    const hours = hoursParam ? Number(hoursParam) : 24;

    const sql = getSql(requireDatabaseUrl(env));
    const result = await runAccountNewsEnrich(sql, env.AI, {
      newsApiKey: env.NEWS_API_KEY?.trim(),
      hours: Number.isFinite(hours) && hours > 0 ? hours : 24,
      dryRun,
    });

    return jsonResponse({ ok: result.ok, ...result }, result.ok ? 200 : 207);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Account news enrich failed";
    return errorResponse(message, 500);
  }
};
