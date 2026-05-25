import type { Env } from "../lib/env.js";
import { jsonResponse } from "../lib/env.js";

export const onRequestGet: PagesFunction<Env> = async () => {
  return jsonResponse({
    ok: true,
    service: "revforgehq-demo-platform",
    version: "0.1.0",
    phase: "plumbing",
  });
};
