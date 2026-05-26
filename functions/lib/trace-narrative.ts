export interface TraceStep {
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
}

export const NARRATIVE_SYSTEM_PROMPT = `You explain marketing automation agent reasoning to a non-technical marketer.

Write a clear, numbered walkthrough (5–7 steps) of how the Audience Agent resolved audience criteria into Segment CDP traits.

RULES:
- Plain English only — no JSON, no code blocks, no internal field names
- Explain WHY each research step mattered, not just what ran
- Name specific traits, campaigns, and criteria when available in the input
- Explicitly call out which criteria were resolved vs still unresolved
- Keep under 400 words
- Do not mention ground truth, eval data, or internal benchmarks`;

const MANIFEST_EXCERPT_MAX = 600;

export function buildNarrativePrompt(
  compactInput: Record<string, unknown>,
  manifestText: string,
  criteriaSource: string,
): string {
  const manifestExcerpt =
    manifestText.length > MANIFEST_EXCERPT_MAX
      ? `${manifestText.slice(0, MANIFEST_EXCERPT_MAX)}…`
      : manifestText;

  return `The Audience Agent finished resolving audience criteria for a campaign.

Audience criteria submitted:
${criteriaSource || "(from campaign record)"}

Research summary (JSON — use for facts only, do not repeat as JSON in your answer):
${JSON.stringify(compactInput)}

Final manifest produced:
${manifestExcerpt}

Write a numbered plain-English reasoning trace explaining how the agent reached this manifest.`;
}

export function buildDeterministicFallback(trace: TraceStep[]): string {
  const lines: string[] = ["Here's how the agent built this audience manifest:"];
  let step = 1;

  const ctxStep = trace.find((t) => t.tool === "get_campaign_context");
  const ctx = ctxStep?.result as
    | {
        found?: boolean;
        campaign?: Record<string, unknown>;
        criteria?: { criterion_text: string }[];
      }
    | undefined;

  if (ctx?.found && ctx.campaign) {
    const c = ctx.campaign;
    const criteriaCount = ctx.criteria?.length ?? 0;
    lines.push(
      `${step}. Loaded campaign ${c.elm_id} (${c.name}) in ${c.business_unit ?? "unknown BU"} with ${criteriaCount} stored criteria line(s).`,
    );
    step += 1;
  }

  const siblingStep = trace.find((t) => t.tool === "find_sibling_campaigns");
  const siblingResult = siblingStep?.result as {
    siblingCount?: number;
    topTraits?: { trait: string; count: number }[];
  };
  if (siblingResult) {
    const top = siblingResult.topTraits?.slice(0, 3).map((t) => t.trait).join(", ");
    lines.push(
      `${step}. Compared ${siblingResult.siblingCount ?? 0} similar campaigns to find recurring Segment traits${top ? `, including ${top}` : ""}.`,
    );
    step += 1;
  }

  const predStep = trace.find((t) => t.tool === "get_predecessor_audiences");
  const preds = (predStep?.result as unknown[]) ?? [];
  lines.push(
    `${step}. Checked ${preds.length} predecessor audience(s) in the campaign dependency chain for inherited targeting patterns.`,
  );
  step += 1;

  const nlStep = trace.find((t) => t.tool === "lookup_nl_phrases");
  const nlResults =
    (nlStep?.result as { criterion: string; matches: Record<string, unknown>[] }[]) ?? [];
  if (nlResults.length) {
    const mapped = nlResults
      .filter((r) => r.matches.length > 0)
      .map((r) => {
        const m = r.matches[0];
        return `"${r.criterion}" → ${m.system_name ?? m.spec_name ?? "a Segment trait"}`;
      });
    if (mapped.length) {
      lines.push(`${step}. Mapped natural-language criteria to Segment traits: ${mapped.join("; ")}.`);
    } else {
      lines.push(`${step}. Searched phrase mappings for ${nlResults.length} criteria but found no strong matches.`);
    }
    step += 1;
  }

  lines.push(
    `${step}. Combined sibling trait frequency, predecessor patterns, and phrase mappings to produce the attribute manifest and Segment expression shown above.`,
  );

  return lines.join("\n\n");
}

export function extractAiText(result: unknown): string {
  return typeof result === "string"
    ? result
    : (result as { response?: string }).response ?? String(result);
}
