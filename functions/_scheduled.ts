import { runAccountNewsEnrich } from "./lib/account-news-enrich.js";
import { getSql } from "./lib/db.js";
import { runCrmSync } from "./lib/crm-sync.js";
import type { Env } from "./lib/env.js";
import { requireDatabaseUrl } from "./lib/env.js";

const NEWS_ENRICH_CRON = "0 6 * * *";

export const onSchedule: PagesFunction<Env> = async ({ env, event }) => {
  const cron = event.cron ?? "";

  if (cron === NEWS_ENRICH_CRON) {
    try {
      const sql = getSql(requireDatabaseUrl(env));
      const result = await runAccountNewsEnrich(sql, env.AI, {
        newsApiKey: env.NEWS_API_KEY?.trim(),
      });
      console.log(
        JSON.stringify({
          event: "account_news_enrich_scheduled",
          ok: result.ok,
          articlesFetched: result.articlesFetched,
          accountsEnriched: result.accountsEnriched,
          eventsAdded: result.eventsAdded,
          errors: result.errors,
        }),
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "account_news_enrich_scheduled_error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      throw err;
    }
    return;
  }

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
        outreachUpserted: result.outreachUpserted,
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
