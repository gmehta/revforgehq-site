import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { errorResponse, jsonResponse, requireDatabaseUrl } from "../../lib/env.js";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const sql = getSql(requireDatabaseUrl(env));
    const ping = await sql`SELECT 1 AS ok`;
    const counts = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM campaigns) AS campaigns,
        (SELECT COUNT(*)::int FROM attribute_mappings) AS attribute_mappings,
        (SELECT COUNT(*)::int FROM nl_phrases) AS nl_phrases,
        (SELECT COUNT(*)::int FROM leads) AS leads,
        (SELECT COUNT(*)::int FROM lead_email_sends) AS lead_email_sends
    `;

    return jsonResponse({
      ok: true,
      ping: ping[0]?.ok === 1,
      ...counts[0],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database ping failed";
    return errorResponse(message, 503);
  }
};
