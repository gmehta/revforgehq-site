import {
  findSiblingCampaigns,
  getCampaignContext,
  getExpectedOutcome,
  getPredecessorAudiences,
  lookupNlPhrases,
} from "../lib/audience-tools.js";
import { getSql } from "../lib/db.js";
import type { Env } from "../lib/env.js";
import { errorResponse, jsonResponse, requireDatabaseUrl } from "../lib/env.js";
import {
  buildDeterministicFallback,
  buildNarrativePrompt,
  extractAiText,
  NARRATIVE_SYSTEM_PROMPT,
  type TraceStep,
} from "../lib/trace-narrative.js";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const MAX_OUTPUT_TOKENS = 768;
const NARRATIVE_MAX_OUTPUT_TOKENS = 512;

const AUDIENCE_SYSTEM_PROMPT = `You are the Audience Agent for RevForgeHQ — an automated campaign build assistant for marketing operations.

You receive tool results from a Neon Postgres knowledge graph. Your job is to resolve audience targeting criteria into specific Segment CDP traits.

RULES:
- KG-first: sibling campaign attributes are the primary trait source
- Frequency wins across siblings
- Never fabricate trait names — mark unresolved criteria explicitly
- Use exact Segment trait names when present in tool data
- Platform is always Segment CDP

OUTPUT: Attribute manifest table + Segment query expression + resolved/unresolved summary. Be concise.`;

interface AgentRequest {
  elmId?: string;
  audienceCriteria?: string;
  approved?: boolean;
}

function parseCriteria(text: string): string[] {
  return text
    .split(/\n|[;,]/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

/** Compact tool output for LLM synthesis — full trace stays in the API response. */
function buildSynthesisInput(
  trace: TraceStep[],
  campaign: Record<string, unknown>,
  criteriaSource: string,
) {
  const ctxStep = trace.find((t) => t.tool === "get_campaign_context");
  const ctx = ctxStep?.result as
    | { criteria?: { criterion_text: string }[]; specs?: Record<string, unknown>[] }
    | undefined;

  const criteria =
    ctx?.criteria?.map((c) => c.criterion_text) ?? parseCriteria(criteriaSource);

  const siblingStep = trace.find((t) => t.tool === "find_sibling_campaigns");
  const siblingResult = siblingStep?.result as {
    siblingCount?: number;
    topTraits?: { trait: string; count: number; campaigns: string[] }[];
  };

  const predecessors =
    (trace.find((t) => t.tool === "get_predecessor_audiences")?.result as Record<
      string,
      unknown
    >[]) ?? [];

  const nlResults =
    (trace.find((t) => t.tool === "lookup_nl_phrases")?.result as {
      criterion: string;
      matches: Record<string, unknown>[];
    }[]) ?? [];

  return {
    campaign: {
      elm_id: campaign.elm_id,
      name: campaign.name,
      campaign_goal: campaign.campaign_goal,
      business_unit: campaign.business_unit,
      products: campaign.products,
    },
    audienceCriteria: criteria,
    existingSpecs: (ctx?.specs ?? []).slice(0, 2).map((s) => ({
      audience_name: s.audience_name,
      platform: s.platform,
      attributes: ((s.attributes as string[]) ?? []).slice(0, 12),
    })),
    siblingTraitSignals: siblingResult?.topTraits?.slice(0, 12),
    siblingCount: siblingResult?.siblingCount,
    predecessors: predecessors.slice(0, 4).map((p) => ({
      elm_id: p.elm_id,
      name: p.name,
      audience_name: p.audience_name,
      attributes: ((p.attributes as string[]) ?? []).slice(0, 10),
    })),
    nlPhraseMappings: nlResults.map(({ criterion, matches }) => ({
      criterion,
      matches: matches.slice(0, 2).map((m) => ({
        spec_name: m.spec_name,
        system_name: m.system_name,
        phrase: m.phrase,
        nl_operator: m.nl_operator,
      })),
    })),
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  let body: AgentRequest;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { elmId, audienceCriteria } = body;
  if (!elmId?.trim()) {
    return errorResponse("Provide elmId (e.g. ELM-9949)", 400);
  }

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const trace: TraceStep[] = [];

    const ctx = await getCampaignContext(sql, elmId.trim());
    trace.push({ tool: "get_campaign_context", input: { elmId }, result: ctx });

    if (!ctx.found || !("campaign" in ctx)) {
      return jsonResponse({
        ok: false,
        error: `Campaign not found for ${elmId}`,
        trace,
      });
    }

    const campaign = ctx.campaign as Record<string, unknown>;
    const campaignId = campaign.id as string;
    const products = (campaign.products as string[]) ?? [];
    const productKeyword = products[0]?.split(" ")[0] ?? undefined;

    const siblings = await findSiblingCampaigns(sql, {
      campaignGoal: campaign.campaign_goal as string | undefined,
      productKeyword,
      businessUnit: campaign.business_unit as string | undefined,
      excludeCampaignId: campaignId,
      limit: 10,
    });
    trace.push({
      tool: "find_sibling_campaigns",
      input: { campaignGoal: campaign.campaign_goal, productKeyword, businessUnit: campaign.business_unit },
      result: {
        siblingCount: siblings.siblings.length,
        topTraits: Object.entries(siblings.traitFrequency)
          .sort((a, b) => (b[1] as { count: number }).count - (a[1] as { count: number }).count)
          .slice(0, 12)
          .map(([trait, meta]) => ({ trait, ...(meta as { count: number; campaigns: string[] }) })),
      },
    });

    const predecessors = await getPredecessorAudiences(sql, campaignId);
    trace.push({
      tool: "get_predecessor_audiences",
      input: { campaignId },
      result: predecessors,
    });

    const criteriaSource =
      audienceCriteria?.trim() ||
      (ctx.criteria as { criterion_text: string }[] | undefined)
        ?.map((c) => c.criterion_text)
        .join("\n") ||
      "";

    const criteriaLines = parseCriteria(criteriaSource);
    const nlResults: Record<string, unknown>[] = [];
    for (const criterion of criteriaLines.slice(0, 8)) {
      const matches = await lookupNlPhrases(sql, criterion, "segment_cdp");
      nlResults.push({ criterion, matches });
    }
    if (criteriaLines.length) {
      trace.push({
        tool: "lookup_nl_phrases",
        input: { criteria: criteriaLines },
        result: nlResults,
      });
    }

    const expected = await getExpectedOutcome(sql, campaignId);
    trace.push({
      tool: "get_expected_outcome",
      input: { campaignId },
      result: expected,
    });

    const compactInput = buildSynthesisInput(trace, campaign, criteriaSource);

    const synthesisPrompt = `Campaign: ${campaign.name} (${campaign.elm_id})
Goal: ${campaign.campaign_goal}
Business unit: ${campaign.business_unit}

Audience criteria to resolve:
${criteriaSource || "(from campaign record)"}

Tool results (JSON):
${JSON.stringify(compactInput)}

Produce:
1. Attribute manifest (trait | operator | value | source)
2. Segment expression
3. Resolved vs unresolved criteria summary`;

    const aiResult = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: AUDIENCE_SYSTEM_PROMPT },
        { role: "user", content: synthesisPrompt },
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
    });

    const responseText = extractAiText(aiResult).trim();

    let reasoningNarrative: string;
    let reasoningSource: "llm" | "fallback";

    try {
      const narrativeResult = await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: NARRATIVE_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildNarrativePrompt(compactInput, responseText, criteriaSource),
          },
        ],
        max_tokens: NARRATIVE_MAX_OUTPUT_TOKENS,
      });
      reasoningNarrative = extractAiText(narrativeResult).trim();
      reasoningSource = reasoningNarrative ? "llm" : "fallback";
      if (!reasoningNarrative) {
        reasoningNarrative = buildDeterministicFallback(trace);
      }
    } catch {
      reasoningNarrative = buildDeterministicFallback(trace);
      reasoningSource = "fallback";
    }

    return jsonResponse({
      ok: true,
      elmId: campaign.elm_id,
      campaignName: campaign.name,
      trace,
      reasoningNarrative,
      reasoningSource,
      response: responseText,
      hitl: {
        approved: Boolean(body.approved),
        note: body.approved
          ? "Approval recorded (UI stub — no CDP write in v1)"
          : "Awaiting marketer approval before CDP activation",
      },
      groundTruth: expected,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent run failed";
    return errorResponse(message, 500);
  }
};

export const onRequestGet: PagesFunction<Env> = async () => {
  return jsonResponse({
    ok: true,
    endpoint: "/api/agent",
    method: "POST",
    body: { elmId: "ELM-9949", audienceCriteria: "LedgerCore subscribers\nActive in last 30 days" },
  });
};
