import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, webhookEndpoints, webhookSubscriptions } from "@/lib/db";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { asRouteError } from "@/lib/auth";
import { HttpError } from "@/lib/server/http-error";
import {
  CLOUD_WEBHOOKS_DISABLED_BODY,
  isCloudWebhooksEnabled,
} from "@/lib/server/cloud-feature";
import { logActivity } from "@/lib/server/activity";

/**
 * `GET    /api/v1/webhooks/[id]`     read one endpoint + its event list
 * `PATCH  /api/v1/webhooks/[id]`     update url / description / events
 * `DELETE /api/v1/webhooks/[id]`     disable the endpoint (soft delete)
 *
 * The DELETE is a soft delete (`disabled_at = now()`) so signed URLs
 * already in flight stop receiving retries from the drain — the drain
 * filters `disabled_at IS NULL` when picking up due deliveries.
 */

const getEndpointOrThrow = async (
  apiKey: NonNullable<Awaited<ReturnType<typeof authenticateApiKey>>>,
  id: string,
) => {
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.orgId, apiKey.orgId!)),
    )
    .limit(1);
  if (!endpoint) throw new HttpError(404, "Webhook not found", "not_found");
  return endpoint;
};

const listEvents = async (endpointId: string) => {
  const rows = await db
    .select({ eventType: webhookSubscriptions.eventType })
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.endpointId, endpointId));
  return rows.map((r) => r.eventType);
};

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
    const endpoint = await getEndpointOrThrow(apiKey, id);
    const events = await listEvents(endpoint.id);
    return NextResponse.json({
      endpoint: {
        id: endpoint.id,
        url: endpoint.url,
        description: endpoint.description,
        events,
        secretPreview: endpoint.secretPreview,
        createdAt: endpoint.createdAt.toISOString(),
        disabledAt: endpoint.disabledAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return asRouteError(error);
  }
}

export async function PATCH(
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
    const body = (await request.json().catch(() => null)) as {
      url?: unknown;
      description?: unknown;
      events?: unknown;
    } | null;
    const endpoint = await getEndpointOrThrow(apiKey, id);
    const updates: Partial<typeof webhookEndpoints.$inferInsert> = {};
    if (typeof body?.url === "string") {
      try {
        const u = new URL(body.url);
        if (u.protocol !== "https:" && u.protocol !== "http:") {
          throw new Error("protocol");
        }
      } catch {
        throw new HttpError(400, "url must be http(s)", "bad_request");
      }
      updates.url = body.url;
    }
    if (typeof body?.description === "string") {
      updates.description = body.description.slice(0, 200);
    }
    if (Object.keys(updates).length > 0) {
      await db
        .update(webhookEndpoints)
        .set(updates)
        .where(eq(webhookEndpoints.id, endpoint.id));
    }
    if (Array.isArray(body?.events)) {
      // Replace the subscription set as a unit. Cheaper than diffing
      // and correct for the common case (org changes the event list
      // together when an integration changes).
      const next = body.events.filter(
        (e): e is (typeof webhookSubscriptions.$inferInsert)["eventType"] =>
          typeof e === "string" &&
          [
            "evidence.sealed",
            "evidence.verified",
            "evidence.expired",
            "agent_run.sealed",
            "anchor.job.settled",
            "signer.rotated",
            "signer.revoked",
            "compliance_report.generated",
          ].includes(e),
      );
      await db.transaction(async (tx) => {
        await tx
          .delete(webhookSubscriptions)
          .where(eq(webhookSubscriptions.endpointId, endpoint.id));
        if (next.length > 0) {
          await tx
            .insert(webhookSubscriptions)
            .values(next.map((eventType) => ({ endpointId: endpoint.id, eventType })));
        }
      });
    }
    await logActivity(apiKey.userId, "webhook_updated", {
      endpointId: endpoint.id,
    });
    const fresh = await getEndpointOrThrow(apiKey, id);
    const events = await listEvents(fresh.id);
    return NextResponse.json({
      endpoint: {
        id: fresh.id,
        url: fresh.url,
        description: fresh.description,
        events,
        secretPreview: fresh.secretPreview,
        createdAt: fresh.createdAt.toISOString(),
        disabledAt: fresh.disabledAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return asRouteError(error);
  }
}

export async function DELETE(
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
    const endpoint = await getEndpointOrThrow(apiKey, id);
    const [updated] = await db
      .update(webhookEndpoints)
      .set({ disabledAt: new Date() })
      .where(eq(webhookEndpoints.id, endpoint.id))
      .returning({ id: webhookEndpoints.id });
    if (!updated) throw new HttpError(404, "Webhook not found", "not_found");
    await logActivity(apiKey.userId, "webhook_revoked", { endpointId: endpoint.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return asRouteError(error);
  }
}
