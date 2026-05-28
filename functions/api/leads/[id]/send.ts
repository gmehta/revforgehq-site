import { getSql } from "../../../lib/db.js";
import type { Env } from "../../../lib/env.js";
import {
  errorResponse,
  jsonResponse,
  requireDatabaseUrl,
  requireLeadsApiKey,
  requirePostmarkConfig,
} from "../../../lib/env.js";
import { getLeadById, recordEmailSend } from "../../../lib/leads.js";
import { sendPostmarkEmail } from "../../../lib/postmark.js";

interface SendRequestBody {
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  dryRun?: boolean;
}


function leadIdFromParams(params: Record<string, string | string[] | undefined>): string | null {
  const raw = params.id;
  if (typeof raw === "string" && raw) return raw;
  if (Array.isArray(raw) && raw[0]) return raw[0];
  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = requireLeadsApiKey(request, env);
  if (auth instanceof Response) return auth;

  const id = leadIdFromParams(params);
  if (!id) {
    return errorResponse("Lead id is required", 400);
  }

  let body: SendRequestBody;
  try {
    body = (await request.json()) as SendRequestBody;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const subject = body.subject?.trim();
  const textBody = body.textBody?.trim();
  if (!subject || !textBody) {
    return errorResponse("subject and textBody are required", 400);
  }

  try {
    const sql = getSql(requireDatabaseUrl(env));
    const lead = await getLeadById(sql, id);
    if (!lead) {
      return errorResponse("Lead not found", 404);
    }
    if (!lead.email) {
      return errorResponse("Lead has no email address", 422);
    }

    const postmark = requirePostmarkConfig(env);
    if (postmark instanceof Response) return postmark;

    if (body.dryRun) {
      return jsonResponse({
        ok: true,
        dryRun: true,
        leadId: id,
        to: lead.email,
        from: postmark.fromEmail,
        subject,
        textBody,
        htmlBody: body.htmlBody ?? null,
      });
    }

    try {
      const result = await sendPostmarkEmail({
        token: postmark.token,
        from: postmark.fromEmail,
        to: lead.email,
        subject,
        textBody,
        htmlBody: body.htmlBody?.trim() || undefined,
      });

      await recordEmailSend(sql, {
        leadId: id,
        messageId: result.messageId,
        fromEmail: postmark.fromEmail,
        toEmail: lead.email,
        subject,
        status: "submitted",
      });

      return jsonResponse({
        ok: true,
        leadId: id,
        to: lead.email,
        messageId: result.messageId,
      });
    } catch (sendErr) {
      const message = sendErr instanceof Error ? sendErr.message : "Postmark send failed";
      await recordEmailSend(sql, {
        leadId: id,
        messageId: null,
        fromEmail: postmark.fromEmail,
        toEmail: lead.email,
        subject,
        status: "failed",
        error: message,
      });
      return errorResponse(message, 502);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    return errorResponse(message, 500);
  }
};
