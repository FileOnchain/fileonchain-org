import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import {
  db,
  webhookDeliveries,
  webhookEndpoints,
  webhookSubscriptions,
  type WebhookEventType,
} from "@/lib/db";
import { sealSecret, openSecret } from "@/lib/crypto/secretbox";

/**
 * Webhook delivery service. The outbox pattern: every Cloud event
 * producer calls `enqueueWebhookDeliveries(orgId, eventType, eventId,
 * payload)` after its DB write commits. The function inserts one row
 * per active endpoint subscribed to that event type, idempotent on
 * `(endpoint_id, event_id)`. Re-runs of the same event are no-ops
 * (the unique index protects against fan-out duplication).
 *
 * Delivery mechanics:
 *   - HMAC-SHA-256 over `t=<unix>.<rawBody>` (Stripe-style header).
 *   - Headers sent:
 *       X-FileOnChain-Timestamp   unix seconds
 *       X-FileOnChain-Signature   t=<ts>,v1=<hex>
 *       X-FileOnChain-Delivery    <deliveryId>
 *       X-FileOnChain-Event       <eventType>
 *       User-Agent                FileOnChain-Webhooks/1
 *   - 2xx = success; the row's `delivered_at` is set and the drain
 *     skips it forever.
 *   - Non-2xx or network failure = retry; `next_attempt_at` is bumped
 *     by exponential backoff up to 5 attempts, then the row stays
 *     pending-attempts with `last_error` recorded. After the 5th
 *     failure `drainDueDeliveries` leaves it alone and the route
 *     surfaces it in the deliveries list as "failed".
 *
 * Replay protection is the caller's responsibility: a verifier
 * rejects `X-FileOnChain-Timestamp` values more than 5 minutes from
 * server time so a leaked request body can't be replayed later.
 *
 * Drain cadence is every minute via the `webhooks-drain` Vercel cron
 * route (`apps/web/src/app/api/cron/webhooks-drain/route.ts`).
 */

const MAX_ATTEMPTS = 5;

/** Exponential-backoff schedule (ms): 30s, 5m, 30m, 2h, 8h. After the
 *  5th attempt fails the delivery stays at `attempts = 5` and the
 *  drain stops touching it. */
const BACKOFF_MS = [
  30 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  8 * 60 * 60 * 1000,
];

const computeBackoffMs = (attempts: number): number =>
  BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 8 * 60 * 60 * 1000;

/** Constant-time HMAC-SHA-256 over `${timestamp}.${rawBody}`. */
export const signWebhookPayload = (
  secret: string,
  timestamp: number,
  body: string,
): string => {
  const payload = `${timestamp}.${body}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
};

/** Constant-time verification of a webhook delivery signature. Use this
 *  in verifier implementations — the server itself signs it in
 *  `dispatchDelivery`. */
export const verifyWebhookSignature = (
  secret: string,
  timestamp: number,
  body: string,
  provided: string,
): boolean => {
  const expected = signWebhookPayload(secret, timestamp, body);
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(provided, "hex"),
    );
  } catch {
    return false;
  }
};

/** Plaintext-format signature header — `t=<ts>,v1=<hex>`. Mirrors the
 *  Stripe convention exactly. */
const formatSignatureHeader = (timestamp: number, hex: string): string =>
  `t=${timestamp},v1=${hex}`;

/** Plaintext-format verification helper — accepts the header string
 *  and returns true if both `t=` and `v1=` match within the 5-minute
 *  replay window. The caller provides the raw body so it can be
 *  hashed exactly as signed. */
export const verifyWebhookHeader = (
  secret: string,
  headerValue: string,
  body: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean => {
  const parts = headerValue.split(",").map((p) => p.trim());
  const tsEntry = parts.find((p) => p.startsWith("t="));
  const v1Entry = parts.find((p) => p.startsWith("v1="));
  if (!tsEntry || !v1Entry) return false;
  const ts = Number(tsEntry.slice(2));
  const provided = v1Entry.slice(3);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowSeconds - ts) > 5 * 60) return false;
  return verifyWebhookSignature(secret, ts, body, provided);
};

/** Mint a random signing secret for a new endpoint. The plaintext is
 *  returned to the caller once and stored sealed. */
export const mintWebhookSecret = (): {
  plaintext: string;
  sealed: string;
  preview: string;
} => {
  const plaintext = `whsec_${randomBytes(32).toString("base64url")}`;
  return {
    plaintext,
    sealed: sealSecret(plaintext),
    preview: plaintext.slice(-4),
  };
};

export const openWebhookSecret = (sealed: string): string => openSecret(sealed);

/** Insert one `webhook_delivery` row per (active endpoint subscribed
 *  to eventType in orgId). No-op when no endpoints match. The unique
 *  index on (endpoint_id, event_id) makes this idempotent: re-running
 *  the same event (e.g. after a partial failure) does not duplicate
 *  rows. Fire-and-forget: callers should `queueMicrotask` so the API
 *  response is not blocked on fan-out. */
export const enqueueWebhookDeliveries = async (
  orgId: string,
  eventType: WebhookEventType,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  try {
    const endpoints = await db
      .select({
        id: webhookEndpoints.id,
      })
      .from(webhookEndpoints)
      .innerJoin(
        webhookSubscriptions,
        and(
          eq(webhookSubscriptions.endpointId, webhookEndpoints.id),
          eq(webhookSubscriptions.eventType, eventType),
        ),
      )
      .where(
        and(eq(webhookEndpoints.orgId, orgId), isNull(webhookEndpoints.disabledAt)),
      );
    if (endpoints.length === 0) return;

    await db
      .insert(webhookDeliveries)
      .values(
        endpoints.map((ep) => ({
          endpointId: ep.id,
          eventId,
          eventType,
          payload,
        })),
      )
      .onConflictDoNothing({
        target: [webhookDeliveries.endpointId, webhookDeliveries.eventId],
      });
  } catch (error) {
    // Webhooks are best-effort: a fan-out failure must never break the
    // caller. Surface to the server console for ops visibility.
    console.error("webhooks: enqueue failed", {
      orgId,
      eventType,
      eventId,
      error,
    });
  }
};

/** Send one pending delivery to its endpoint. Returns true on a 2xx
 *  response; false on any other outcome (and updates the row to record
 *  the retry schedule + last error). */
const postDelivery = async (
  url: string,
  secret: string,
  body: string,
  deliveryId: string,
  eventType: string,
): Promise<{ ok: boolean; error?: string }> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = formatSignatureHeader(
    timestamp,
    signWebhookPayload(secret, timestamp, body),
  );
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "FileOnChain-Webhooks/1",
        "x-fileonchain-timestamp": String(timestamp),
        "x-fileonchain-signature": signature,
        "x-fileonchain-delivery": deliveryId,
        "x-fileonchain-event": eventType,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `HTTP ${res.status} ${text.slice(0, 200)}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "fetch failed",
    };
  }
};

/** Dispatch a single delivery by id. Updates the row's `attempts`,
 *  `delivered_at`, `last_error`, and `next_attempt_at` accordingly.
 *  No-op when the delivery is already delivered or absent. */
export const dispatchDelivery = async (
  deliveryId: string,
): Promise<{ dispatched: boolean; ok: boolean }> => {
  const [row] = await db
    .select({
      id: webhookDeliveries.id,
      endpointId: webhookDeliveries.endpointId,
      eventId: webhookDeliveries.eventId,
      eventType: webhookDeliveries.eventType,
      payload: webhookDeliveries.payload,
      attempts: webhookDeliveries.attempts,
    })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);
  if (!row) return { dispatched: false, ok: false };

  const [endpoint] = await db
    .select({
      url: webhookEndpoints.url,
      encryptedSecret: webhookEndpoints.encryptedSecret,
      disabledAt: webhookEndpoints.disabledAt,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, row.endpointId))
    .limit(1);
  if (!endpoint || endpoint.disabledAt) {
    // Endpoint is gone or disabled — leave the row as-is and stop
    // touching it. Operators can re-enable or delete it from the
    // dashboard.
    return { dispatched: false, ok: false };
  }

  const secret = openWebhookSecret(endpoint.encryptedSecret);
  const body = JSON.stringify(row.payload);
  const result = await postDelivery(
    endpoint.url,
    secret,
    body,
    row.id,
    row.eventType,
  );
  const nextAttempts = row.attempts + 1;
  if (result.ok) {
    await db
      .update(webhookDeliveries)
      .set({
        attempts: nextAttempts,
        deliveredAt: new Date(),
        lastError: null,
        nextAttemptAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, row.id));
    return { dispatched: true, ok: true };
  }
  const nextAt = new Date(Date.now() + computeBackoffMs(nextAttempts));
  await db
    .update(webhookDeliveries)
    .set({
      attempts: nextAttempts,
      lastError: result.error ?? "unknown",
      nextAttemptAt: nextAt,
    })
    .where(eq(webhookDeliveries.id, row.id));
  // After the 5th failure the row stays pending with `attempts = 5` and
  // is no longer picked up by the drain. The UI surfaces it via the
  // deliveries list (`delivered_at IS NULL AND attempts >= 5`), not via
  // the activity log — webhook deliveries don't have a "user" to
  // attribute them to, and a separate system-activity stream is out of
  // scope for this build.
  return { dispatched: true, ok: false };
};

/** Drain every delivery whose `next_attempt_at` has passed and that is
 *  still under the attempt cap. Returns the number attempted. Called
 *  by the `webhooks-drain` cron route once per minute. */
export const drainDueDeliveries = async (
  { limit = 200 }: { limit?: number } = {},
): Promise<{ attempted: number }> => {
  const now = new Date();
  const due = await db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(
      and(
        isNull(webhookDeliveries.deliveredAt),
        lte(webhookDeliveries.nextAttemptAt, now),
        sql`${webhookDeliveries.attempts} < ${MAX_ATTEMPTS}`,
      ),
    )
    .limit(limit);
  let attempted = 0;
  for (const row of due) {
    const { ok } = await dispatchDelivery(row.id);
    if (ok) attempted += 1;
  }
  return { attempted: attempted };
};

/** Inspect a row by id without dispatching. Used by the
 *  deliveries-listing route. */
export const getDelivery = async (deliveryId: string) => {
  const [row] = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);
  return row ?? null;
};
