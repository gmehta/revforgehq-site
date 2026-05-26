import type { CollisionRow } from "./collision-tools.js";
import type { ProposedAudience } from "./collision-tools.js";
import type { TraceStep } from "./trace-narrative.js";
import { extractAiText } from "./trace-narrative.js";

export const COLLISION_NARRATIVE_SYSTEM_PROMPT = `You explain audience collision analysis to a non-technical marketer planning Adobe B2B CDP activations.

Write a clear, numbered walkthrough (5–7 steps) of how the Collision Agent estimated overlap between a proposed audience and active campaign audiences.

RULES:
- Plain English only — no JSON, no code blocks
- Explain WHY overlap matters for downstream systems (Marketo, Braze)
- Name top colliding campaigns and estimated overlap counts when provided
- Mention the date window scanned for active campaigns
- Note that overlap uses trait similarity (Jaccard) — a demo estimate, not exact identity resolution
- Keep under 400 words
- Do not mention internal database table names`;

export function buildCollisionNarrativePrompt(
  compactInput: Record<string, unknown>,
): string {
  return `The Audience Collision Agent finished analyzing overlap for a proposed Adobe B2B CDP audience.

Analysis summary (JSON — use for facts only, do not repeat as JSON in your answer):
${JSON.stringify(compactInput)}

Write a numbered plain-English reasoning trace explaining overlap risk, top colliding campaigns, and recommended marketer actions before activation.`;
}

export function buildCollisionDeterministicFallback(
  trace: TraceStep[],
  proposed: ProposedAudience,
  topCollisions: CollisionRow[],
  dateRange: { startDate: string; endDate: string },
): string {
  const lines: string[] = [
    "Here's how the Collision Agent estimated audience overlap before downstream activation:",
  ];
  let step = 1;

  lines.push(
    `${step}. Resolved ${proposed.criteria.length} natural-language criteria into ${proposed.traits.length} Adobe B2B CDP trait signals for the proposed cohort (~${proposed.estimatedSize.toLocaleString()} accounts).`,
  );
  step += 1;

  const activeStep = trace.find((t) => t.tool === "find_active_campaign_audiences");
  const activeCount =
    (activeStep?.result as { count?: number })?.count ??
    (activeStep?.result as unknown[])?.length ??
    0;

  lines.push(
    `${step}. Scanned ${activeCount} campaign audience(s) with activation windows overlapping ${dateRange.startDate} through ${dateRange.endDate}.`,
  );
  step += 1;

  const collisionStep = trace.find((t) => t.tool === "compute_collisions");
  const viz = collisionStep?.result as { totalOverlapEstimate?: number; uniqueSize?: number } | undefined;

  if (topCollisions.length) {
    const top = topCollisions.slice(0, 3);
    const names = top
      .map((c) => `${c.name ?? c.elmId ?? c.campaignId} (~${c.overlapCount.toLocaleString()} overlap)`)
      .join("; ");
    lines.push(
      `${step}. Highest overlap campaigns: ${names}. Overlap is estimated via shared trait similarity (Jaccard), not exact profile matching.`,
    );
    step += 1;
  } else {
    lines.push(
      `${step}. No significant trait overlap found with active campaigns in this date window — proposed audience appears largely unique.`,
    );
    step += 1;
  }

  if (viz) {
    lines.push(
      `${step}. Total estimated collision: ~${(viz.totalOverlapEstimate ?? 0).toLocaleString()} accounts (${Math.round(((viz.totalOverlapEstimate ?? 0) / Math.max(1, proposed.estimatedSize)) * 100)}% of proposed cohort). Unique reach after overlap: ~${(viz.uniqueSize ?? 0).toLocaleString()}.`,
    );
    step += 1;
  }

  const dests = [...new Set(topCollisions.flatMap((c) => c.destinations))].slice(0, 4);
  if (dests.length) {
    lines.push(
      `${step}. Colliding audiences activate to ${dests.join(", ")} — coordinate send timing and frequency caps before launching the proposed audience.`,
    );
  } else {
    lines.push(
      `${step}. Review collision table before activating to Marketo or Braze to avoid over-messaging shared accounts.`,
    );
  }

  return lines.join("\n\n");
}

export function buildCollisionCompactInput(
  proposed: ProposedAudience,
  collisions: CollisionRow[],
  dateRange: { startDate: string; endDate: string },
  visualization: { uniqueSize: number; totalOverlapEstimate: number },
) {
  return {
    dateRange,
    proposedAudience: {
      criteria: proposed.criteria,
      traits: proposed.traits.slice(0, 12),
      estimatedSize: proposed.estimatedSize,
      expression: proposed.expression.slice(0, 200),
    },
    overlapSummary: {
      totalOverlapEstimate: visualization.totalOverlapEstimate,
      uniqueSize: visualization.uniqueSize,
      collisionCount: collisions.length,
    },
    topCollisions: collisions.slice(0, 5).map((c) => ({
      campaign: c.name ?? c.elmId,
      overlapCount: c.overlapCount,
      overlapPct: Math.round(c.overlapPct * 100),
      destinations: c.destinations.slice(0, 3),
      activationWindow: `${c.activationStart} – ${c.activationEnd}`,
    })),
  };
}

export { extractAiText };
