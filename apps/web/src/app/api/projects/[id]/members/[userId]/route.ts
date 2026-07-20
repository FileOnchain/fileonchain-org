import { NextResponse } from "next/server";
import { requireUser, asRouteError } from "@/lib/auth";
import {
  CLOUD_TENANCY_DISABLED_BODY,
  isCloudTenancyEnabled,
} from "@/lib/server/cloud-feature";
import { removeProjectMember } from "@/lib/server/projects";
import { logActivity } from "@/lib/server/activity";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  if (!isCloudTenancyEnabled()) {
    return NextResponse.json(CLOUD_TENANCY_DISABLED_BODY, { status: 503 });
  }
  try {
    const userId = await requireUser();
    const { id, userId: targetUserId } = await params;
    await removeProjectMember(userId, id, targetUserId);
    await logActivity(userId, "project_member_removed", {
      projectId: id,
      targetUserId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return asRouteError(error);
  }
}
