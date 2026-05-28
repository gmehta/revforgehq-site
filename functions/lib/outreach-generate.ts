import type { Ai } from "@cloudflare/workers-types";
import type { CompanyContextCache, CompanyContextResult } from "./company-context.js";
import { getCompanyContext } from "./company-context.js";
import type { Sql } from "./db.js";
import type { OutreachLeadRow } from "./outreach.js";
import { extractAiText } from "./trace-narrative.js";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const MAX_OUTPUT_TOKENS = 768;

export type WorkflowArea = "SalesTech" | "MarTech" | "AdTech";

const REVFORGE_CAPABILITIES = `RevForgeHQ is an AI consulting practice for revenue and marketing leaders. We build demo-led agent workflows on knowledge graphs — pre-call account intelligence, hyper-personalized outbound, creative performance diagnostics, and RevOps unification across SalesTech, MarTech, and AdTech.`;

const OUTREACH_SYSTEM_PROMPT = `You write warm LinkedIn outreach messages for RevForgeHQ. Tone: conversational, curious, not salesy. No pricing, no "book a demo", no hype.

Structure (~120–180 words):
1. Personal hi using their first name, role, and company — weave in ONE line of company context naturally.
2. Brief RevForgeHQ intro (AI consulting, knowledge graphs + agents for GTM leaders).
3. Soft invite to explore brainstorming ONE workflow area (SalesTech, MarTech, or AdTech) — low pressure.
4. End with gentle curiosity ("open to a quick swap?" / "happy to share what we're seeing").

Return ONLY valid JSON (no markdown):
{"messageBody":"full LinkedIn message text","workflowArea":"SalesTech|MarTech|AdTech"}`;

export function inferWorkflowArea(lead: OutreachLeadRow): WorkflowArea {
  const title = (lead.title ?? "").toLowerCase();
  const tier = lead.gtm_tier ?? 3;

  if (
    /\b(cro|chief revenue|revops|revenue operations|sales operations|salesops|vp sales|sales enablement)\b/.test(
      title,
    )
  ) {
    return "SalesTech";
  }
  if (
    /\b(cmo|chief marketing|marops|marketing operations|demand gen|lifecycle|martech|marketing automation|cdp|customer data)\b/.test(
      title,
    )
  ) {
    return "MarTech";
  }
  if (/\b(adtech|advertising|performance marketing|media|programmatic|paid social|paid search)\b/.test(title)) {
    return "AdTech";
  }
  if (tier === 3) return "MarTech";
  if (tier === 1 && /\b(revenue|sales)\b/.test(title)) return "SalesTech";
  return "MarTech";
}

function firstName(lead: OutreachLeadRow): string {
  if (lead.first_name?.trim()) return lead.first_name.trim();
  const full = lead.full_name?.trim() ?? "";
  return full.split(/\s+/)[0] || "there";
}

function parseOutreachResponse(text: string, fallbackArea: WorkflowArea): {
  messageBody: string;
  workflowArea: WorkflowArea;
} {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
        messageBody?: string;
        workflowArea?: string;
      };
      const body = parsed.messageBody?.trim();
      const area = parsed.workflowArea?.trim() as WorkflowArea | undefined;
      if (body) {
        const validAreas: WorkflowArea[] = ["SalesTech", "MarTech", "AdTech"];
        const workflowArea = validAreas.includes(area as WorkflowArea)
          ? (area as WorkflowArea)
          : fallbackArea;
        return { messageBody: body, workflowArea };
      }
    } catch {
      /* fall through */
    }
  }

  const cleaned = trimmed.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
  if (cleaned.length > 80) {
    return { messageBody: cleaned, workflowArea: fallbackArea };
  }

  throw new Error("Failed to parse outreach message from AI response");
}

export function buildOutreachPrompt(
  lead: OutreachLeadRow,
  companyContext: CompanyContextResult,
  workflowHint: WorkflowArea,
): string {
  return `Contact:
- First name: ${firstName(lead)}
- Full name: ${lead.full_name ?? ""}
- Title: ${lead.title ?? ""}
- Company: ${lead.company ?? ""}
- GTM tier: ${lead.gtm_tier ?? ""} (${lead.gtm_tier_reason ?? ""})
- Suggested workflow area: ${workflowHint}

Company context hook (use one line naturally in the opener):
- Hook: ${companyContext.hook}
- Source: ${companyContext.source}
${companyContext.url ? `- URL: ${companyContext.url}` : ""}

RevForgeHQ capabilities (summarize briefly, do not copy verbatim):
${REVFORGE_CAPABILITIES}

Write the LinkedIn message JSON.`;
}

export async function generateOutreachMessage(
  ai: Ai,
  lead: OutreachLeadRow,
  companyContext: CompanyContextResult,
): Promise<{ messageBody: string; workflowArea: WorkflowArea; companyContextText: string }> {
  const workflowHint = inferWorkflowArea(lead);
  const prompt = buildOutreachPrompt(lead, companyContext, workflowHint);

  const result = await ai.run(MODEL, {
    messages: [
      { role: "system", content: OUTREACH_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_tokens: MAX_OUTPUT_TOKENS,
  });

  const parsed = parseOutreachResponse(extractAiText(result), workflowHint);
  const companyContextText = companyContext.url
    ? `${companyContext.fullContext} (${companyContext.source}: ${companyContext.url})`
    : `${companyContext.fullContext} (${companyContext.source})`;

  return {
    messageBody: parsed.messageBody,
    workflowArea: parsed.workflowArea,
    companyContextText,
  };
}

export async function generateOutreachForLead(
  ai: Ai,
  sql: Sql,
  lead: OutreachLeadRow,
  newsApiKey: string | undefined,
  cache: CompanyContextCache,
): Promise<{ messageBody: string; workflowArea: WorkflowArea; companyContextText: string }> {
  const companyKey = lead.company_key ?? lead.company?.trim().toLowerCase() ?? "";
  const companyName = lead.company?.replace(/^"|"$/g, "").trim() ?? "your company";

  const context = await getCompanyContext(
    sql,
    {
      companyKey,
      companyName,
      domain: lead.domain,
      segment: lead.segment,
      newsApiKey,
    },
    cache,
  );

  return generateOutreachMessage(ai, lead, context);
}
