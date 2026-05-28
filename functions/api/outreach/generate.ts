import type { CompanyContextCache } from "../../lib/company-context.js";
import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import {
  errorResponse,
  jsonResponse,
  requireDatabaseUrl,
  requireLeadsApiKey,
} from "../../lib/env.js";
import { generateOutreachForLead } from "../../lib/outreach-generate.js";
import {
  countOutreachMessages,
  getOutreachLead,
  hasOutreachMessage,
  listOutreachCohort,
  listPendingOutreachLeads,
  upsertOutreachMessage,
} from "../../lib/outreach.js";

interface GenerateRequest {
  leadId?: string;
  force?: boolean;
}

async function processLead(
  env: Env,
  leadId: string,
  force: boolean,
  cache: CompanyContextCache,
) {
  const sql = getSql(requireDatabaseUrl(env));

  if (!force && (await hasOutreachMessage(sql, leadId))) {
    return { ok: true, leadId, skipped: true, reason: "already exists" };
  }

  const lead = await getOutreachLead(sql, leadId);
  if (!lead) {
    return { ok: false, leadId, error: "Lead not in Varun tier 1-3 cohort" };
  }

  const generated = await generateOutreachForLead(
    env.AI,
    sql,
    lead,
    env.NEWS_API_KEY?.trim(),
    cache,
  );

  const saved = await upsertOutreachMessage(sql, {
    leadId,
    messageBody: generated.messageBody,
    companyContext: generated.companyContextText,
    workflowArea: generated.workflowArea,
  });

  return {
    ok: true,
    leadId,
    skipped: false,
    workflowArea: saved.workflow_area,
    messagePreview: saved.message_body.slice(0, 120),
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = requireLeadsApiKey(request, env);
  if (auth instanceof Response) return auth;

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const cohort = await listOutreachCohort(sql);
    const generated = await countOutreachMessages(sql);
    return jsonResponse({
      ok: true,
      cohortSize: cohort.length,
      generatedCount: generated,
      pendingCount: cohort.length - generated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read outreach status";
    return errorResponse(message, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = requireLeadsApiKey(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const batchParam = url.searchParams.get("batch");
  const batchSize = batchParam ? Math.min(Math.max(parseInt(batchParam, 10) || 1, 1), 20) : 0;

  let body: GenerateRequest = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as GenerateRequest;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const force = body.force === true;
  const cache: CompanyContextCache = new Map();

  try {
    if (batchSize > 0) {
      const sql = getSql(requireDatabaseUrl(env));
      const pending = force
        ? (await listOutreachCohort(sql, batchSize))
        : await listPendingOutreachLeads(sql, batchSize);

      const results = [];
      for (const lead of pending) {
        try {
          const result = await processLead(env, lead.id, force, cache);
          results.push(result);
        } catch (err) {
          results.push({
            ok: false,
            leadId: lead.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const okCount = results.filter((r) => r.ok && !("skipped" in r && r.skipped)).length;
      return jsonResponse({
        ok: results.every((r) => r.ok),
        batchSize: batchSize,
        processed: results.length,
        generated: okCount,
        results,
      });
    }

    const leadId = body.leadId?.trim();
    if (!leadId) {
      return errorResponse("Provide leadId or use ?batch=N", 400);
    }

    const result = await processLead(env, leadId, force, cache);
    if (!result.ok) {
      return errorResponse(result.error ?? "Generation failed", 404);
    }

    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Outreach generation failed";
    return errorResponse(message, 500);
  }
};
