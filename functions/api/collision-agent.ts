import {
  COLLISION_SCENARIOS,
  defaultDateRange,
  getScenarioById,
} from "../lib/collision-scenarios.js";
import {
  buildCollisionCompactInput,
  buildCollisionDeterministicFallback,
  buildCollisionNarrativePrompt,
  COLLISION_NARRATIVE_SYSTEM_PROMPT,
  extractAiText,
} from "../lib/collision-narrative.js";
import {
  buildProposedAudience,
  computeCollisions,
  findActiveCampaignAudiences,
} from "../lib/collision-tools.js";
import { getSql } from "../lib/db.js";
import type { Env } from "../lib/env.js";
import { errorResponse, jsonResponse, requireDatabaseUrl } from "../lib/env.js";
import type { TraceStep } from "../lib/trace-narrative.js";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const MANIFEST_MAX_TOKENS = 512;
const NARRATIVE_MAX_TOKENS = 512;

const MANIFEST_SYSTEM_PROMPT = `You are the Audience Collision Agent for RevForgeHQ — Adobe B2B CDP audience planning assistant.

Summarize a proposed audience manifest from resolved traits. Be concise.

OUTPUT:
1. Audience name suggestion
2. Key traits (bullet list)
3. One-line Segment-style expression
Platform: Adobe B2B CDP (Segment substrate). No fabrication — use only provided traits.`;

interface CollisionRequest {
  scenarioId?: string;
  startDate?: string;
  endDate?: string;
}

async function runCollisionAnalysis(
  env: Env,
  scenarioId: string,
  startDate: string,
  endDate: string,
) {
  const scenario = getScenarioById(scenarioId);
  if (!scenario) {
    return { error: `Unknown scenario: ${scenarioId}`, status: 400 as const };
  }

  const sql = getSql(requireDatabaseUrl(env));
  const trace: TraceStep[] = [];

  const { proposed, nlMappings } = await buildProposedAudience(sql, scenario);
  trace.push({
    tool: "resolve_criteria_traits",
    input: { scenarioId, criteria: scenario.criteria },
    result: { traits: proposed.traits, nlMappings },
  });

  trace.push({
    tool: "estimate_cohort_size",
    input: { traits: proposed.traits, defaultSize: scenario.defaultSize },
    result: { estimatedSize: proposed.estimatedSize },
  });

  const activeAudiences = await findActiveCampaignAudiences(sql, startDate, endDate);
  trace.push({
    tool: "find_active_campaign_audiences",
    input: { startDate, endDate },
    result: {
      count: activeAudiences.length,
      campaigns: activeAudiences.slice(0, 10).map((r) => ({
        elm_id: r.elm_id,
        name: r.name,
        activation_start: r.activation_start,
        activation_end: r.activation_end,
      })),
    },
  });

  const visualization = computeCollisions(proposed, activeAudiences as Record<string, unknown>[]);
  trace.push({
    tool: "compute_collisions",
    input: { proposedSize: proposed.estimatedSize, activeCount: activeAudiences.length },
    result: {
      collisionCount: visualization.collisions.length,
      totalOverlapEstimate: visualization.totalOverlapEstimate,
      uniqueSize: visualization.uniqueSize,
      topOverlap: visualization.collisions.slice(0, 3),
    },
  });

  const compactInput = buildCollisionCompactInput(
    proposed,
    visualization.collisions,
    { startDate, endDate },
    visualization,
  );

  let manifestSummary = "";
  try {
    const manifestResult = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: MANIFEST_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Proposed audience criteria:\n${proposed.criteria.join("\n")}\n\nResolved traits:\n${proposed.traits.join(", ")}\n\nEstimated size: ${proposed.estimatedSize}`,
        },
      ],
      max_tokens: MANIFEST_MAX_TOKENS,
    });
    manifestSummary = extractAiText(manifestResult).trim();
  } catch {
    manifestSummary = `Proposed audience: ${scenario.label}\nTraits: ${proposed.traits.slice(0, 8).join(", ")}\nExpression: ${proposed.expression}`;
  }

  let reasoningNarrative: string;
  let reasoningSource: "llm" | "fallback";

  try {
    const narrativeResult = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: COLLISION_NARRATIVE_SYSTEM_PROMPT },
        { role: "user", content: buildCollisionNarrativePrompt(compactInput) },
      ],
      max_tokens: NARRATIVE_MAX_TOKENS,
    });
    reasoningNarrative = extractAiText(narrativeResult).trim();
    reasoningSource = reasoningNarrative ? "llm" : "fallback";
    if (!reasoningNarrative) {
      reasoningNarrative = buildCollisionDeterministicFallback(
        trace,
        proposed,
        visualization.collisions,
        { startDate, endDate },
      );
    }
  } catch {
    reasoningNarrative = buildCollisionDeterministicFallback(
      trace,
      proposed,
      visualization.collisions,
      { startDate, endDate },
    );
    reasoningSource = "fallback";
  }

  trace.push({
    tool: "synthesize_collision_narrative",
    input: { compactInput },
    result: { source: reasoningSource, length: reasoningNarrative.length },
  });

  return {
    ok: true as const,
    scenarioId,
    scenarioLabel: scenario.label,
    dateRange: { startDate, endDate },
    proposedAudience: proposed,
    manifestSummary,
    collisions: visualization.collisions,
    visualization,
    reasoningNarrative,
    reasoningSource,
    trace,
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  let body: CollisionRequest;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const scenarioId = body.scenarioId?.trim() || "core-active-engaged";
  const defaults = defaultDateRange();
  const startDate = body.startDate?.trim() || defaults.startDate;
  const endDate = body.endDate?.trim() || defaults.endDate;

  try {
    const result = await runCollisionAnalysis(env, scenarioId, startDate, endDate);
    if ("error" in result && result.error) {
      return errorResponse(result.error, result.status ?? 400);
    }
    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Collision agent run failed";
    return errorResponse(message, 500);
  }
};

export const onRequestGet: PagesFunction<Env> = async () => {
  const dates = defaultDateRange();
  return jsonResponse({
    ok: true,
    endpoint: "/api/collision-agent",
    scenarios: COLLISION_SCENARIOS.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
    })),
    defaultDateRange: dates,
    defaultScenarioId: "core-active-engaged",
  });
};
