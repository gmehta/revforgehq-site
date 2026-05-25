import type { Env } from "../../lib/env.js";
import { errorResponse, jsonResponse } from "../../lib/env.js";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    let prompt = "Reply with exactly one short sentence confirming Workers AI is working.";
    try {
      const body = (await request.json()) as { prompt?: string };
      if (body.prompt?.trim()) {
        prompt = body.prompt.trim().slice(0, 500);
      }
    } catch {
      // Empty body is fine — use default prompt.
    }

    const result = await env.AI.run(MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 80,
    });

    const text =
      typeof result === "string"
        ? result
        : (result as { response?: string }).response ?? JSON.stringify(result);

    return jsonResponse({
      ok: true,
      model: MODEL,
      response: text.trim(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Workers AI ping failed";
    return errorResponse(message, 503);
  }
};

export const onRequestGet: PagesFunction<Env> = async () => {
  return jsonResponse({
    ok: true,
    endpoint: "/api/ai/ping",
    method: "POST",
    model: MODEL,
    hint: "POST with optional { prompt } body for a smoke test",
  });
};
