import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireOrgRole } from "@/lib/server/organizations";
import {
  getEffectiveRetention,
  setRetentionPolicy,
} from "@/lib/server/retention";
import { logActivity } from "@/lib/server/activity";
import {
  CLOUD_DISABLED_BODY,
  isCloudEvidenceEnabled,
} from "@/lib/server/cloud-feature";
import { asOrgError } from "../../shared";

type Params = { params: Promise<{ id: string }> };

/**
 * Session-authed per-org retention editor for the `/cloud/retention`
 * dashboard. Distinct from the API-key path `PATCH /api/v1/retention`: the
 * dashboard authenticates by session, so we re-check org membership here and
 * require owner/admin. Positive integer days only.
 *
 * Gated on `FILEONCHAIN_CLOUD_EVIDENCE_ENABLED` — the retention policy is
 * the evidence surface's per-org TTL, so the editor is part of the closed
 * Cloud feature (the API-key path under `/api/v1/retention` has the same
 * gate).
 */

export async function GET(_request: Request, { params }: Params) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  try {
    const userId = await requireUser();
    const { id } = await params;
    await requireOrgRole(userId, id, ["owner", "admin", "member"]);
    const policy = await getEffectiveRetention(id);
    return NextResponse.json(policy);
  } catch (error) {
    return asOrgError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  try {
    const userId = await requireUser();
    const { id } = await params;
    await requireOrgRole(userId, id);
    const body = (await request.json().catch(() => null)) as {
      windowDays?: unknown;
    } | null;
    const windowDays =
      typeof body?.windowDays === "number" ? Math.trunc(body.windowDays) : NaN;
    if (!Number.isInteger(windowDays) || windowDays <= 0) {
      return NextResponse.json(
        { error: "windowDays must be a positive integer" },
        { status: 400 },
      );
    }
    await setRetentionPolicy(id, windowDays);
    await logActivity(userId, "retention_updated", { orgId: id, windowDays });
    return NextResponse.json({ windowDays, source: "policy" });
  } catch (error) {
    return asOrgError(error);
  }
}
