import { getSql } from "../../lib/db.js";
import type { Env } from "../../lib/env.js";
import { errorResponse, jsonResponse, requireDatabaseUrl, requirePostmarkToken, requireRunnerKey } from "../../lib/env.js";
import { sendPostmarkEmail } from "../../lib/postmark.js";
import { buildReportReadyEmail, logSignupEvent, radarFromEmail } from "../../lib/radar.js";

interface NotifyBody {
  report_id?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/radar/notify  (Bearer RADAR_RUNNER_KEY)
// Called by the offline report runner after it generates a report. Emails the
// account the "report ready" link. The runner never holds the Postmark token.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = requireRunnerKey(request, env);
  if (auth instanceof Response) return auth;

  let body: NotifyBody;
  try {
    body = (await request.json()) as NotifyBody;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  const reportId = (body.report_id ?? "").trim();
  if (!UUID_RE.test(reportId)) return errorResponse("Invalid report_id", 400);

  const postmarkToken = requirePostmarkToken(env);
  if (postmarkToken instanceof Response) return postmarkToken;

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const rows = await sql`
      SELECT r.view_token, a.email, a.full_name, b.brand_name
      FROM radar_reports r
      JOIN radar_accounts a ON a.id = r.account_id
      JOIN radar_brands b ON b.id = r.brand_id
      WHERE r.id = ${reportId}
      LIMIT 1`;
    if (!rows.length) return errorResponse("Report not found", 404);

    const { view_token, email, full_name, brand_name } = rows[0] as {
      view_token: string; email: string; full_name: string; brand_name: string;
    };

    const base = (env.PUBLIC_BASE_URL?.trim() || new URL(request.url).origin).replace(/\/$/, "");
    const reportUrl = `${base}/api/radar/report?id=${reportId}&t=${encodeURIComponent(view_token)}`;
    const { text, html } = buildReportReadyEmail(full_name ?? "", brand_name ?? "your brand", reportUrl);

    const result = await sendPostmarkEmail({
      token: postmarkToken,
      from: `RevForgeHQ Radar <${radarFromEmail(env.RADAR_FROM_EMAIL)}>`,
      to: email,
      subject: `Your ${brand_name} AI visibility report is ready`,
      textBody: text,
      htmlBody: html,
    });

    await logSignupEvent(sql, { email, event: "report_email_sent", detail: reportId });
    return jsonResponse({ ok: true, messageId: result.messageId });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Notify failed", 500);
  }
};
