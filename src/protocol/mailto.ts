import type { EmailDraft } from "../domain.js";

export const BOARDY_EMAIL = "boardy@boardy.ai";

/**
 * mailto link for the public agent guide.
 * Line breaks are %0D%0A, which is the encoding the guide asks for.
 * Long links get truncated by some apps, so callers should also show the full text.
 */
export function mailtoLink(message: { to: string; subject: string; body: string }): string {
  const body = message.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  const params = new URLSearchParams();
  params.set("subject", message.subject);
  params.set("body", body);
  const query = params.toString().replace(/\+/g, "%20");
  return `mailto:${message.to}?${query}`;
}

export function toDraft(message: { from: string | null; subject: string; body: string }): EmailDraft {
  return {
    to: BOARDY_EMAIL,
    ...(message.from ? { from: message.from } : {}),
    subject: message.subject,
    body: message.body,
    mailto: mailtoLink({ to: BOARDY_EMAIL, subject: message.subject, body: message.body }),
  };
}
