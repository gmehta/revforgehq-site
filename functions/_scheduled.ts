import { runAccountNewsEnrich } from "./lib/account-news-enrich.js";
import { getSql } from "./lib/db.js";
import { runCrmSync } from "./lib/crm-sync.js";
import type { Env } from "./lib/env.js";
import { requireDatabaseUrl } from "./lib/env.js";
import { processOneScanJob } from "./lib/radar-scan.js";

const NEWS_ENRICH_CRON = "0 6 * * *";
const SCAN_CRON = "* * * * *"; // every minute: process one queued Radar scan job

export const onSchedule: PagesFunction<Env> = async ({ env, event }) => {
  const cron = event.cron ?? "";

  // Every minute: generate one queued report (real scan → report → email).
  if (cron === SCAN_CRON) {
    try {
      const r = await processOneScanJob(env);
      if (r.processed || r.error) console.log(JSON.stringify({ event: "radar_scan_tick", ...r }));
    } catch (err) {
      console.error(JSON.stringify({ event: "radar_scan_tick_error", message: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  // Downgrade expired Pro trials to Free (runs on every cron tick, idempotent).
  // After 7 days a trial drops to Free so it keeps getting weekly reports instead
  // of going dark; trial_expired_at drives the dashboard's "upgrade" banner.
  try {
    const sql = getSql(requireDatabaseUrl(env));
    const downgraded = await sql`
      UPDATE radar_accounts
      SET plan = 'free', trial_expired_at = NOW()
      WHERE plan = 'pro_trial' AND status = 'active'
        AND trial_ends_at <= NOW() AND trial_expired_at IS NULL
      RETURNING id`;
    if (downgraded.length) console.log(JSON.stringify({ event: "radar_trial_downgraded", count: downgraded.length }));
  } catch (err) {
    console.error(JSON.stringify({ event: "radar_trial_downgrade_error", message: err instanceof Error ? err.message : String(err) }));
  }

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
