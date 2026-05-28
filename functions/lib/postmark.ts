export interface SendEmailInput {
  token: string;
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
}

export interface SendEmailResult {
  messageId: string;
}

export async function sendPostmarkEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const payload: Record<string, string> = {
    From: input.from,
    To: input.to,
    Subject: input.subject,
    TextBody: input.textBody,
  };
  if (input.htmlBody) {
    payload.HtmlBody = input.htmlBody;
  }

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": input.token,
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as { MessageID?: string; Message?: string; ErrorCode?: number };
  if (!response.ok) {
    throw new Error(body.Message ?? `Postmark error ${response.status}`);
  }
  if (!body.MessageID) {
    throw new Error("Postmark response missing MessageID");
  }
  return { messageId: body.MessageID };
}
