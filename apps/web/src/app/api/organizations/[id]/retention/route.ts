import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireOrgRole } from "@/lib/server/organizations";
import {
  getEffectiveRetention,
  setRetentionPolicy,
} from "@/lib/server/retention";
import { logActivity } from "@/lib/server/activity";
import { asOrgError } from "../../shared";

type Params = { params: Promise<{ id: string }> };

/**
 * Session-authed per-org retention editor for the `/cloud/retention`
 * dashboard. Distinct from the API-key path `PATCH /api/v1/retention`: the
 * dashboard authenticates by session, so we re-check org membership here and
 * require owner/admin. Positive integer days only.
 */

export async function GET(_request: Request, { params }: Params) {
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
