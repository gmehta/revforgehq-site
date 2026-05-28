import type { Ai } from "@cloudflare/workers-types";
import { extractAiText } from "./trace-narrative.js";
import { signalsForPrompt, type StackSignal } from "./stack-research.js";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const MAX_OUTPUT_TOKENS = 768;

export type StackConfidence = "high" | "medium" | "low";

export interface ExtractedTechStack {
  salestech: string[];
  martech: string[];
  adtech: string[];
  confidence: StackConfidence;
  inferred_domain: string | null;
  sources: { type: string; url: string; snippet: string }[];
}

const STACK_SYSTEM_PROMPT = `You extract SalesTech, MarTech, and AdTech tools from public web/job signal snippets for a B2B account.

SalesTech examples: Salesforce, HubSpot CRM, Gong, Outreach, Salesloft, Clari, ZoomInfo
MarTech examples: Marketo, HubSpot Marketing, Segment, Braze, Iterable, Adobe Experience Cloud, CDP platforms
AdTech examples: Google Ads, Meta Ads, The Trade Desk, DV360, programmatic platforms

Return ONLY valid JSON (no markdown):
{
  "salestech": ["Tool Name"],
  "martech": ["Tool Name"],
  "adtech": ["Tool Name"],
  "confidence": "high|medium|low",
  "inferred_domain": "example.com or null"
}

Rules:
- ONLY include tools explicitly mentioned in the provided snippets
- Do not invent or guess tools not in the snippets
- Normalize names (SFDC -> Salesforce)
- Empty arrays if no tools found for a category
- confidence high = 2+ tools with clear company association; medium = 1 tool; low = none or weak association
- inferred_domain only if a snippet clearly states the company's website domain`;

function normalizeToolList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v).trim()).filter(Boolean))];
}

function parseStackResponse(text: string): Omit<ExtractedTechStack, "sources"> {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Failed to parse stack JSON from AI response");
  }

  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  const confidenceRaw = String(parsed.confidence ?? "low").toLowerCase();
  const confidence: StackConfidence =
    confidenceRaw === "high" || confidenceRaw === "medium" ? confidenceRaw : "low";

  let inferred_domain: string | null = null;
  if (parsed.inferred_domain && parsed.inferred_domain !== "null") {
    const domain = String(parsed.inferred_domain).trim().toLowerCase();
    inferred_domain = domain.replace(/^https?:\/\//, "").split("/")[0] || null;
  }

  return {
    salestech: normalizeToolList(parsed.salestech),
    martech: normalizeToolList(parsed.martech),
    adtech: normalizeToolList(parsed.adtech),
    confidence,
    inferred_domain,
  };
}

export function buildStackSources(signals: StackSignal[]): { type: string; url: string; snippet: string }[] {
  return signals.slice(0, 12).map((s) => ({
    type: s.queryType,
    url: s.url,
    snippet: s.headline,
  }));
}

export async function extractTechStackFromSignals(
  ai: Ai,
  input: {
    companyName: string;
    segment: string | null;
    signals: StackSignal[];
  },
): Promise<ExtractedTechStack> {
  if (!input.signals.length) {
    return {
      salestech: [],
      martech: [],
      adtech: [],
      confidence: "low",
      inferred_domain: null,
      sources: [],
    };
  }

  const prompt = `Company: ${input.companyName}
Segment: ${input.segment ?? "unknown"}

Public signal snippets (JSON):
${JSON.stringify(signalsForPrompt(input.signals))}

Extract tech stack JSON only. Use snippets as sole evidence.`;

  const result = await ai.run(MODEL, {
    messages: [
      { role: "system", content: STACK_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_tokens: MAX_OUTPUT_TOKENS,
  });

  const parsed = parseStackResponse(extractAiText(result));
  return {
    ...parsed,
    sources: buildStackSources(input.signals),
  };
}
