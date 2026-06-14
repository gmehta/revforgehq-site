import type { Env } from "../../lib/env.js";
import { corsPreflightResponse, errorResponse, jsonResponse } from "../../lib/env.js";
import { brandFromDomain, normalizeDomain } from "../../lib/radar.js";

// @cf/meta/llama-3.1-8b-instruct was deprecated 2026-05-30; use a current model.
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

interface SuggestBody {
  domain?: string;
}

function fallbackPrompts(brand: string): string[] {
  return [
    `best alternatives to ${brand}`,
    `is ${brand} worth it`,
    `${brand} vs competitors`,
    `${brand} pricing and plans`,
    `${brand} reviews`,
    `top competitors to ${brand}`,
  ];
}

interface Suggestion {
  prompts?: unknown;
  competitors?: unknown;
}

/** Pull the first JSON object out of an LLM string response (handles prose / code fences). */
function extractJson(text: string): Suggestion | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Suggestion;
  } catch {
    return null;
  }
}

const NAME_RE = /^[\p{L}0-9][\p{L}0-9 &.,'’\-]{0,38}$/u;

function cleanList(raw: unknown, max: number, drop: (s: string) => boolean): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const s = String(item ?? "").trim().replace(/^["'\s\-•]+|["'\s]+$/g, "");
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key) || drop(s)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => corsPreflightResponse(request);

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: SuggestBody;
  try {
    body = (await request.json()) as SuggestBody;
  } catch {
    return errorResponse("Invalid JSON body", 400, request);
  }

  const domain = normalizeDomain(body.domain ?? "");
  if (!domain) return errorResponse("Enter a valid domain, e.g. acme.com", 400, request);
  const brand = brandFromDomain(domain);

  // Always have sensible defaults so the flow never breaks on an AI hiccup.
  let prompts = fallbackPrompts(brand);
  let competitors: string[] = [];

  // The model is non-deterministic and occasionally returns an unparseable
  // response. Retry up to twice, keeping the best prompts and stopping as soon
  // as we get competitors (the highest-value field).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await env.AI.run(MODEL, {
        messages: [
          {
            role: "system",
            content:
              "You are an AEO research assistant. Given a company's website domain, infer its product category and audience. Reply with JSON only — no prose, no code fences.",
          },
          {
            role: "user",
            content:
              `Domain: ${domain} (brand: ${brand}).\n` +
              `Return JSON with exactly two keys:\n` +
              `"prompts": 6 short natural-language questions a buyer would type into ChatGPT/Perplexity/Gemini when researching this brand's category — mix discovery ("best X for Y"), comparison ("${brand} vs ..."), and brand ("is ${brand} worth it") queries. Lowercase, no quotes.\n` +
              `"competitors": up to 5 real, well-known competing brand names in the same category (names only, not ${brand}).\n` +
              `JSON only.`,
          },
        ],
        max_tokens: 400,
      });

      // Workers AI may return `response` as a string OR (for JSON-mode models) an
      // already-parsed object. Handle both.
      const resp = typeof result === "string" ? result : (result as { response?: unknown }).response;
      const parsed: Suggestion | null =
        resp && typeof resp === "object" ? (resp as Suggestion) : extractJson(typeof resp === "string" ? resp : "");

      if (parsed) {
        const p = cleanList(parsed.prompts, 8, (s) => s.length < 4 || s.length > 120);
        const c = cleanList(parsed.competitors, 6, (s) => !NAME_RE.test(s) || s.toLowerCase() === brand.toLowerCase());
        if (p.length >= 3) prompts = p;
        if (c.length > 0) {
          competitors = c;
          break;
        }
      }
    } catch {
      // Hard AI error (down / rate-capped) — don't retry, use deterministic defaults.
      break;
    }
  }

  return jsonResponse({ ok: true, brand, domain, prompts, competitors }, 200, request);
};
