import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, webhookDeliveries, webhookEndpoints } from "@/lib/db";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { asRouteError } from "@/lib/auth";
import {
  CLOUD_WEBHOOKS_DISABLED_BODY,
  isCloudWebhooksEnabled,
} from "@/lib/server/cloud-feature";

/**
 * `GET /api/v1/webhooks/[id]/deliveries?limit=` — recent deliveries for
 * a single endpoint, ordered by `created_at DESC`. The 50 most-recent
 * are enough for the dashboard; for higher-volume diagnostics this
 * endpoint would page (out of scope for v1).
 */

export async function GET(
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
    const [endpoint] = await db
      .select({ id: webhookEndpoints.id })
      .from(webhookEndpoints)
      .where(
        and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.orgId, apiKey.orgId!)),
      )
      .limit(1);
    if (!endpoint) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
    const rows = await db
      .select({
        id: webhookDeliveries.id,
        eventId: webhookDeliveries.eventId,
        eventType: webhookDeliveries.eventType,
        attempts: webhookDeliveries.attempts,
        deliveredAt: webhookDeliveries.deliveredAt,
        lastError: webhookDeliveries.lastError,
        nextAttemptAt: webhookDeliveries.nextAttemptAt,
        createdAt: webhookDeliveries.createdAt,
      })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.endpointId, endpoint.id))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit);
    return NextResponse.json({
      deliveries: rows.map((r) => ({
        ...r,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        nextAttemptAt: r.nextAttemptAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return asRouteError(error);
  }
}
