import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, webhookEndpoints, webhookSubscriptions, type WebhookEventType } from "@/lib/db";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { asRouteError } from "@/lib/auth";
import { HttpError } from "@/lib/server/http-error";
import {
  CLOUD_WEBHOOKS_DISABLED_BODY,
  isCloudWebhooksEnabled,
} from "@/lib/server/cloud-feature";
import { mintWebhookSecret } from "@/lib/server/webhooks";
import { logActivity } from "@/lib/server/activity";

/**
 * `GET  /api/v1/webhooks`              list active endpoints for the org
 * `POST /api/v1/webhooks`              create an endpoint
 *
 * Auth: org-scoped API key (`scope = "org"`). The Cloud never lets a
 * personal key talk to webhook config. Tenant auth lives in
 * `requireOrgApiKey`-equivalent helpers below.
 */

const VALID_EVENT_TYPES: ReadonlySet<WebhookEventType> = new Set([
  "evidence.sealed",
  "evidence.verified",
  "evidence.expired",
  "agent_run.sealed",
  "anchor.job.settled",
  "signer.rotated",
  "signer.revoked",
  "compliance_report.generated",
]);

const isEventType = (s: unknown): s is WebhookEventType =>
  typeof s === "string" && VALID_EVENT_TYPES.has(s as WebhookEventType);

const isValidUrl = (s: unknown): s is string => {
  if (typeof s !== "string") return false;
  try {
    const u = new URL(s);
    // HTTPS is the only scheme a production receiver should advertise.
    // http:// is allowed only for localhost / 127.0.0.1 / ::1 so dev
    // tooling (ngrok, local tunnels) can wire up without a proxy —
    // a public http:// endpoint would be a downgrade + MITM risk for
    // the HMAC-signed delivery.
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:") {
      const host = u.hostname.toLowerCase();
      return host === "localhost" || host === "127.0.0.1" || host === "::1";
    }
    return false;
  } catch {
    return false;
  }
};

const listOrg = async (orgId: string) => {
  const rows = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(eq(webhookEndpoints.orgId, orgId), isNull(webhookEndpoints.disabledAt)),
    )
    .orderBy(desc(webhookEndpoints.createdAt));
  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    description: row.description,
    secretPreview: row.secretPreview,
    createdAt: row.createdAt.toISOString(),
    disabledAt: null as string | null,
  }));
};

export async function GET(request: Request) {
  if (!isCloudWebhooksEnabled()) {
    return NextResponse.json(CLOUD_WEBHOOKS_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey || !apiKey.orgId || apiKey.scope === "personal") {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const endpoints = await listOrg(apiKey.orgId);
    return NextResponse.json({ endpoints });
  } catch (error) {
    return asRouteError(error);
  }
}

export async function POST(request: Request) {
  if (!isCloudWebhooksEnabled()) {
    return NextResponse.json(CLOUD_WEBHOOKS_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey || !apiKey.orgId || apiKey.scope === "personal") {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => null)) as {
      url?: unknown;
      description?: unknown;
      events?: unknown;
    } | null;
    if (!isValidUrl(body?.url)) {
      throw new HttpError(
        400,
        "url must be an https:// URL (or http://localhost for dev)",
        "bad_request",
      );
    }
    const events: WebhookEventType[] = Array.isArray(body?.events)
      ? body.events.filter(isEventType)
      : [];
    if (events.length === 0) {
      throw new HttpError(
        400,
        "events must be a non-empty array of WebhookEventType values",
        "bad_request",
      );
    }
    const description =
      typeof body?.description === "string" ? body.description.slice(0, 200) : "";

    const minted = mintWebhookSecret();
    const [endpoint] = await db
      .insert(webhookEndpoints)
      .values({
        orgId: apiKey.orgId,
        url: body.url,
        description,
        encryptedSecret: minted.sealed,
        secretPreview: minted.preview,
        createdByUserId: apiKey.userId,
      })
      .returning();
    if (!endpoint) throw new HttpError(500, "Insert returned no row", "internal_error");

    if (events.length > 0) {
      await db
        .insert(webhookSubscriptions)
        .values(
          events.map((eventType) => ({
            endpointId: endpoint.id,
            eventType,
          })),
        );
    }
    await logActivity(apiKey.userId, "webhook_created", {
      endpointId: endpoint.id,
      url: endpoint.url,
      events: events.join(","),
    });

    return NextResponse.json({
      endpoint: {
        id: endpoint.id,
        url: endpoint.url,
        description: endpoint.description,
        events,
        secretPreview: endpoint.secretPreview,
        createdAt: endpoint.createdAt.toISOString(),
      },
      // Plaintext is shown exactly once at creation. Subsequent GETs
      // redact it; rotate_secret re-shows it.
      secret: minted.plaintext,
    });
  } catch (error) {
    return asRouteError(error);
  }
}

/** Re-exported for `/api/v1/webhooks/[id]/route.ts` — session-authed
 *  management uses the same `requireUser` path that the v1 API key
 *  surface uses, so the ownership check lives here.
 *  (Note: do not export `requireUser` from this file — Next.js rejects
 *  non-handler exports in route files. The sibling route imports it
 *  from `@/lib/auth` directly.) */
