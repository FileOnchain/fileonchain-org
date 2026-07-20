import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, webhookDeliveries, webhookEndpoints } from "@/lib/db";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { asRouteError } from "@/lib/auth";
import { HttpError } from "@/lib/server/http-error";
import {
  CLOUD_WEBHOOKS_DISABLED_BODY,
  isCloudWebhooksEnabled,
} from "@/lib/server/cloud-feature";
import { dispatchDelivery } from "@/lib/server/webhooks";

/**
 * `POST /api/v1/webhooks/deliveries/[id]/redeliver` — force a
 * re-delivery by resetting `next_attempt_at = now()` and dispatching.
 * Useful when a partner fixed their webhook receiver and asks for a
 * replay. Rate-limited implicitly by the attempts-bump (each call
 * counts as an attempt; the regular backoff applies for further
 * failures).
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCloudWebhooksEnabled()) {
    return NextResponse.json(CLOUD_WEBHOOKS_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey || !apiKey.orgId || apiKey.scope === "personal") {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const [row] = await db
      .select({
        id: webhookDeliveries.id,
        endpointId: webhookDeliveries.endpointId,
      })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, id))
      .limit(1);
    if (!row) throw new HttpError(404, "Delivery not found", "not_found");
    const [endpoint] = await db
      .select({ orgId: webhookEndpoints.orgId })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, row.endpointId))
      .limit(1);
    if (!endpoint || endpoint.orgId !== apiKey.orgId) {
      throw new HttpError(404, "Delivery not found", "not_found");
    }
    // Reset the next attempt to now so dispatchDelivery picks it up
    // immediately. The attempt counter keeps its prior value so the
    // redelivery still counts toward the cap.
    await db
      .update(webhookDeliveries)
      .set({ nextAttemptAt: new Date() })
      .where(eq(webhookDeliveries.id, row.id));
    const result = await dispatchDelivery(row.id);
    if (!result.dispatched) {
      throw new HttpError(409, "Delivery not dispatched", "conflict");
    }
    return NextResponse.json({
      ok: result.ok,
      deliveryId: row.id,
    });
  } catch (error) {
    return asRouteError(error);
  }
}
