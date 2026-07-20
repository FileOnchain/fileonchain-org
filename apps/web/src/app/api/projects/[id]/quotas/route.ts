import { NextResponse } from "next/server";
import { requireUser, asRouteError } from "@/lib/auth";
import { updateProjectQuotas } from "@/lib/server/projects";
import { logActivity } from "@/lib/server/activity";
import {
  CLOUD_TENANCY_DISABLED_BODY,
  isCloudTenancyEnabled,
} from "@/lib/server/cloud-feature";
import { HttpError } from "@/lib/server/http-error";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCloudTenancyEnabled()) {
    return NextResponse.json(CLOUD_TENANCY_DISABLED_BODY, { status: 503 });
  }
  try {
    const userId = await requireUser();
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      envelopesPerMonth?: unknown;
      anchorsPerMonth?: unknown;
      bytesAnchoredPerMonth?: unknown;
      retentionDays?: unknown;
    } | null;
    const numOrNull = (v: unknown): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v !== "" && Number.isFinite(Number(v)))
        return Number(v);
      throw new HttpError(400, `Bad number: ${String(v)}`, "bad_request");
    };
    await updateProjectQuotas(userId, id, {
      envelopesPerMonth: numOrNull(body?.envelopesPerMonth),
      anchorsPerMonth: numOrNull(body?.anchorsPerMonth),
      bytesAnchoredPerMonth: numOrNull(body?.bytesAnchoredPerMonth),
      retentionDays: numOrNull(body?.retentionDays),
    });
    await logActivity(userId, "project_quotas_updated", { projectId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return asRouteError(error);
  }
}
