import { getSql } from "../../../lib/db.js";
import type { Env } from "../../../lib/env.js";
import { jsonResponse, requireDatabaseUrl } from "../../../lib/env.js";
import { requireAdmin } from "../../../lib/admin.js";

// GET /api/radar/admin/data — dashboard payload (auth: admin session cookie).
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  const sql = getSql(requireDatabaseUrl(env));

  const [acct, rep, jobAgg, emailAgg, funnelAgg, signups, reports, jobs, sends] = await Promise.all([
    sql`SELECT count(*)::int total,
               count(*) FILTER (WHERE status='active')::int active,
               count(*) FILTER (WHERE status='pending_verification')::int pending,
               count(*) FILTER (WHERE plan='free')::int plan_free,
               count(*) FILTER (WHERE plan IN ('pro_trial','pro','scale'))::int plan_pro,
               count(verified_at)::int verified,
               count(*) FILTER (WHERE trial_ends_at > now() AND status='active')::int trialing
        FROM radar_accounts`,
    sql`SELECT count(*)::int total,
               count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int today,
               count(*) FILTER (WHERE is_mock)::int mock,
               count(*) FILTER (WHERE NOT is_mock)::int real,
               COALESCE(round(avg(mention_rate)::numeric,1),0) avg_rate
        FROM radar_reports`,
    sql`SELECT status, count(*)::int n FROM radar_scan_jobs GROUP BY status`,
    sql`SELECT event, count(*)::int n FROM radar_signup_events
        WHERE event IN ('verification_sent','report_email_sent') GROUP BY event`,
    sql`SELECT event, count(*)::int n FROM radar_signup_events
        WHERE event IN ('signup_requested','verification_sent','verified') GROUP BY event`,
    sql`SELECT a.email, a.full_name, a.plan, a.status, a.created_at, a.verified_at,
               b.brand_name, b.domain
        FROM radar_accounts a
        LEFT JOIN LATERAL (SELECT brand_name, domain FROM radar_brands WHERE account_id=a.id ORDER BY created_at LIMIT 1) b ON true
        ORDER BY a.created_at DESC LIMIT 100`,
    sql`SELECT r.id, r.tier, r.mention_rate, r.engines, r.prompt_count, r.is_mock,
               r.created_at, r.view_token, b.brand_name, a.email
        FROM radar_reports r
        JOIN radar_brands b ON b.id=r.brand_id
        JOIN radar_accounts a ON a.id=r.account_id
        ORDER BY r.created_at DESC LIMIT 100`,
    sql`SELECT j.id, j.kind, j.status, j.created_at, j.started_at, j.finished_at, b.brand_name
        FROM radar_scan_jobs j JOIN radar_brands b ON b.id=j.brand_id
        ORDER BY j.created_at DESC LIMIT 100`,
    sql`SELECT created_at, email, event, detail FROM radar_signup_events
        ORDER BY created_at DESC LIMIT 100`,
  ]);

  const jobBy = Object.fromEntries(jobAgg.map((r) => [r.status, r.n]));
  const emailBy = Object.fromEntries(emailAgg.map((r) => [r.event, r.n]));
  const funnelBy = Object.fromEntries(funnelAgg.map((r) => [r.event, r.n]));
  const a0 = acct[0] ?? {};
  const r0 = rep[0] ?? {};

  return jsonResponse({
    ok: true,
    generated_at: new Date().toISOString(),
    admin: auth,
    kpis: {
      signups_total: a0.total ?? 0,
      verified: a0.verified ?? 0,
      active: a0.active ?? 0,
      pending: a0.pending ?? 0,
      trialing: a0.trialing ?? 0,
      plan_free: a0.plan_free ?? 0,
      plan_pro: a0.plan_pro ?? 0,
      reports_total: r0.total ?? 0,
      reports_today: r0.today ?? 0,
      reports_mock: r0.mock ?? 0,
      reports_real: r0.real ?? 0,
      mention_rate_avg: Number(r0.avg_rate ?? 0),
      jobs_queued: jobBy.queued ?? 0,
      jobs_running: jobBy.running ?? 0,
      jobs_done: jobBy.done ?? 0,
      jobs_failed: jobBy.failed ?? 0,
      emails_verification: emailBy.verification_sent ?? 0,
      emails_report: emailBy.report_email_sent ?? 0,
    },
    funnel: {
      requested: funnelBy.signup_requested ?? 0,
      verification_sent: funnelBy.verification_sent ?? 0,
      verified: funnelBy.verified ?? 0,
    },
    signups,
    reports,
    jobs,
    sends,
  });
};
