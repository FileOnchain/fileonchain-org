import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, webhookEndpoints } from "@/lib/db";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { asRouteError } from "@/lib/auth";
import { HttpError } from "@/lib/server/http-error";
import {
  CLOUD_WEBHOOKS_DISABLED_BODY,
  isCloudWebhooksEnabled,
} from "@/lib/server/cloud-feature";
import { logActivity } from "@/lib/server/activity";
import { mintWebhookSecret } from "@/lib/server/webhooks";

/**
 * `POST /api/v1/webhooks/[id]/rotate_secret` — mint a fresh signing
 * secret, replace the sealed row, return the plaintext once. Existing
 * pending deliveries still carry the previous HMAC tag and will fail
 * signature verification until the receiver rolls too — that's the
 * point of rotation.
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
    const [endpoint] = await db
      .select()
      .from(webhookEndpoints)
      .where(
        and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.orgId, apiKey.orgId!)),
      )
      .limit(1);
    if (!endpoint) throw new HttpError(404, "Webhook not found", "not_found");
    const minted = mintWebhookSecret();
    const [updated] = await db
      .update(webhookEndpoints)
      .set({
        encryptedSecret: minted.sealed,
        secretPreview: minted.preview,
      })
      .where(eq(webhookEndpoints.id, endpoint.id))
      .returning({ id: webhookEndpoints.id });
    if (!updated) throw new HttpError(500, "Rotate returned no row", "internal_error");
    await logActivity(apiKey.userId, "webhook_secret_rotated", {
      endpointId: endpoint.id,
    });
    return NextResponse.json({
      secret: minted.plaintext,
      secretPreview: minted.preview,
    });
  } catch (error) {
    return asRouteError(error);
  }
}
