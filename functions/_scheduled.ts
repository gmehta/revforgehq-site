import { getSql } from "./lib/db.js";
import { runCrmSync } from "./lib/crm-sync.js";
import type { Env } from "./lib/env.js";
import { requireDatabaseUrl } from "./lib/env.js";

export const onSchedule: PagesFunction<Env> = async ({ env }) => {
  try {
    const sql = getSql(requireDatabaseUrl(env));
    const result = await runCrmSync(sql, env);
    console.log(
      JSON.stringify({
        event: "crm_sync_scheduled",
        ok: result.ok,
        runType: result.runType,
        leadsUpserted: result.leadsUpserted,
        accountsUpserted: result.accountsUpserted,
        errors: result.errors,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "crm_sync_scheduled_error",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    throw err;
  }
};
