import "server-only";

/**
 * Minimal Resend client: one POST to https://api.resend.com/emails. Kept
 * as a plain `fetch` (no SDK dependency) because the contact form is the
 * only sender and needs nothing beyond a text email with a reply-to.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ResendEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}

export class ResendError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ResendError";
  }
}

/** Send one email; resolves to the Resend message id. */
export const sendResendEmail = async (apiKey: string, email: ResendEmail): Promise<string> => {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: email.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const payload = (await response.json().catch(() => null)) as {
    id?: string;
    message?: string;
  } | null;
  if (!response.ok || !payload?.id) {
    throw new ResendError(
      response.status,
      payload?.message ?? `Resend request failed with status ${response.status}`,
    );
  }
  return payload.id;
};
