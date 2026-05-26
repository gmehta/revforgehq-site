import {
  computeCollisions,
  findActiveCampaignAudiences,
  type ProposedAudience,
} from "../../lib/collision-tools.js";
import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { errorResponse, jsonResponse, requireDatabaseUrl } from "../../lib/env.js";

interface OverlapRequest {
  proposedAudience?: ProposedAudience;
  startDate?: string;
  endDate?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  let body: OverlapRequest;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const proposed = body.proposedAudience;
  if (!proposed?.traits?.length) {
    return errorResponse("Provide proposedAudience from a prior collision-agent run", 400);
  }

  const startDate = body.startDate?.trim();
  const endDate = body.endDate?.trim();
  if (!startDate || !endDate) {
    return errorResponse("Provide startDate and endDate", 400);
  }

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const activeAudiences = await findActiveCampaignAudiences(sql, startDate, endDate);
    const visualization = computeCollisions(proposed, activeAudiences as Record<string, unknown>[]);

    return jsonResponse({
      ok: true,
      dateRange: { startDate, endDate },
      collisions: visualization.collisions,
      visualization,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Overlap recalculation failed";
    return errorResponse(message, 500);
  }
};
