import {
  countAccounts,
  countStackEnriched,
  enrichAccountStack,
  getAccountForStack,
  getLatestStackRun,
  hasStackEnrichment,
  listAccountsPendingStack,
  listAllAccountsForStack,
  runAccountStackEnrichBatch,
} from "../../lib/account-stack-enrich.js";
import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import {
  errorResponse,
  jsonResponse,
  requireDatabaseUrl,
  requireLeadsApiKey,
} from "../../lib/env.js";

interface StackEnrichRequest {
  accountId?: string;
  force?: boolean;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = requireLeadsApiKey(request, env);
  if (auth instanceof Response) return auth;

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const [totalAccounts, enrichedCount, lastRun] = await Promise.all([
      countAccounts(sql),
      countStackEnriched(sql),
      getLatestStackRun(sql),
    ]);
    return jsonResponse({
      ok: true,
      totalAccounts,
      enrichedCount,
      pendingCount: totalAccounts - enrichedCount,
      lastRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read stack enrich status";
    return errorResponse(message, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = requireLeadsApiKey(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const batchParam = url.searchParams.get("batch");
  const batchSize = batchParam ? Math.min(Math.max(parseInt(batchParam, 10) || 1, 1), 10) : 0;

  let body: StackEnrichRequest = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as StackEnrichRequest;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const force = body.force === true;

  try {
    const sql = getSql(requireDatabaseUrl(env));

    if (batchSize > 0) {
      const pending = force
        ? await listAllAccountsForStack(sql, batchSize)
        : await listAccountsPendingStack(sql, batchSize);

      const result = await runAccountStackEnrichBatch(env.AI, sql, pending);
      return jsonResponse(
        {
          ok: result.ok,
          batchSize,
          processed: result.accountsProcessed,
          enriched: result.accountsEnriched,
          errors: result.errors,
        },
        result.ok ? 200 : 207,
      );
    }

    const accountId = body.accountId?.trim();
    if (!accountId) {
      return errorResponse("Provide accountId or use ?batch=N", 400);
    }

    if (!force && (await hasStackEnrichment(sql, accountId))) {
      return jsonResponse({ ok: true, accountId, skipped: true, reason: "already enriched" });
    }

    const account = await getAccountForStack(sql, accountId);
    if (!account) {
      return errorResponse("Account not found", 404);
    }

    const techStack = await enrichAccountStack(env.AI, sql, account);
    return jsonResponse({
      ok: true,
      accountId,
      skipped: false,
      confidence: techStack.confidence,
      salestech: techStack.salestech,
      martech: techStack.martech,
      adtech: techStack.adtech,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Account stack enrich failed";
    return errorResponse(message, 500);
  }
};
