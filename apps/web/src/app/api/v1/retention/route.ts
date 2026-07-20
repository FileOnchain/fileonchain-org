import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import {
  getEffectiveRetention,
  setRetentionPolicy,
} from "@/lib/server/retention";
import { HttpError } from "@/lib/server/http-error";
import { requireOrgApiKey, type OrgApiKey } from "@/lib/server/evidence";
import { asRouteError } from "@/lib/auth";
import {
  CLOUD_DISABLED_BODY,
  isCloudEvidenceEnabled,
} from "@/lib/server/cloud-feature";

/**
 * `GET /api/v1/retention` — return the effective retention window for the
 * caller's org (policy row when set, otherwise the hard-coded default).
 *
 * `PATCH /api/v1/retention` — upsert the per-org retention window in
 * days. Positive integer required; the `0` / negative case is rejected
 * with 400 so a bad client cannot disable expiry.
 *
 * Both endpoints require an org-scoped API key (`orgId != NULL`).
 */

const asOrgApiKey = (row: NonNullable<Awaited<ReturnType<typeof authenticateApiKey>>>): OrgApiKey => ({
  id: row.id,
  userId: row.userId,
  orgId: row.orgId,
  scope: row.scope,
});

export async function GET(request: Request) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const orgId = requireOrgApiKey(asOrgApiKey(apiKey));
    const result = await getEffectiveRetention(orgId);
    return NextResponse.json(result);
  } catch (error) {
    return asRouteError(error);
  }
}

export async function PATCH(request: Request) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const orgId = requireOrgApiKey(asOrgApiKey(apiKey));
    const body = (await request.json().catch(() => null)) as { windowDays?: unknown } | null;
    const windowDays =
      typeof body?.windowDays === "number" ? Math.trunc(body.windowDays) : NaN;
    if (!Number.isInteger(windowDays) || windowDays <= 0) {
      throw new HttpError(400, "windowDays must be a positive integer", "bad_request");
    }
    await setRetentionPolicy(orgId, windowDays);
    return NextResponse.json({ windowDays, source: "policy" });
  } catch (error) {
    return asRouteError(error);
  }
}
