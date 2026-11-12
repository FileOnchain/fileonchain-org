import { NextResponse } from "next/server";
import { asRouteError } from "@/lib/auth";
import { formatContactEmail, validateContactInput } from "@/lib/contact";
import { env } from "@/lib/env";
import { HttpError, httpError, notImplemented } from "@/lib/server/http-error";
import { clientIp, enforceContactRateLimit } from "@/lib/server/rate-limit";
import { ResendError, sendResendEmail } from "@/lib/server/resend";

/** Request bodies above this are rejected before parsing. The largest
 *  valid submission (5000-char message plus short fields) is well under. */
const MAX_BODY_BYTES = 32 * 1024;

/**
 * POST /api/contact: the public contact form. Validates with the same
 * rules the browser ran (`lib/contact.ts`), rate-limits per IP, and
 * forwards the message to the team inbox through Resend as a plain-text
 * email whose reply-to is the sender. Nothing is stored.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const apiKey = env.resendApiKey;
    const to = env.contactToEmails;
    const from = env.contactFromEmail;
    if (!apiKey || to.length === 0 || !from) throw notImplemented("The contact form");

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BODY_BYTES) {
      throw new HttpError(413, "Message is too large.");
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, "Message is too large.");

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Request body must be JSON.");
    }

    // Honeypot: a field hidden from people that bots fill in. Answer as if
    // it worked so the bot has nothing to learn from.
    const honeypot = (body as { website?: unknown } | null)?.website;
    if (typeof honeypot === "string" && honeypot.trim() !== "") {
      return NextResponse.json({ ok: true });
    }

    const result = validateContactInput(body);
    if (!result.ok) {
      return NextResponse.json(
        { error: "Please fix the highlighted fields.", code: "bad_request", fields: result.errors },
        { status: 400 },
      );
    }

    try {
      await enforceContactRateLimit(clientIp(request));
    } catch (error) {
      if (error instanceof HttpError) {
        throw httpError(429, "rate_limited", "Too many messages. Please try again in a minute.");
      }
      // The limiter lives in Postgres; a missing or unreachable database
      // should not take the contact form down with it.
      console.error("[contact] rate limiter unavailable", error);
    }

    const { subject, text } = formatContactEmail(result.value);
    try {
      await sendResendEmail(apiKey, { from, to, subject, text, replyTo: result.value.email });
    } catch (error) {
      console.error(
        "[contact] Resend send failed",
        error instanceof ResendError ? `${error.status}: ${error.message}` : error,
      );
      throw new HttpError(502, "We could not send your message. Please try again later.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return asRouteError(error);
  }
}
