// Single source of truth for per-plan limits. The scan path, the signup seed,
// and the logged-in prompt/competitor managers all read from here so the
// advertised "up to 15 / up to 50 prompts" caps are honored everywhere.

export interface TierCfg {
  engines: string[];
  promptLimit: number;
}

export function tierConfig(plan: string): TierCfg {
  if (plan === "free") return { engines: ["openai"], promptLimit: 15 };
  // pro_trial | pro | scale — full engine set, 50 prompts
  return { engines: ["openai", "perplexity", "gemini", "aioverview"], promptLimit: 50 };
}

export const promptLimitFor = (plan: string): number => tierConfig(plan).promptLimit;

// Competitors are capped the same across plans.
export const MAX_COMPETITORS = 10;

// Prompt stages the scanner understands.
export const PROMPT_STAGES = ["discover", "compare", "validate", "branded"] as const;
export type PromptStage = (typeof PROMPT_STAGES)[number];

export function planLabel(plan: string): string {
  if (plan === "free") return "Free";
  if (plan === "pro_trial") return "Pro trial";
  return (plan || "").replace(/^\w/, (c) => c.toUpperCase()) || "Pro";
}
