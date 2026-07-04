import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { removeOrganizationMember } from "@/lib/server/organizations";
import { logActivity } from "@/lib/server/activity";
import { asOrgError } from "../../../shared";

type Params = { params: Promise<{ id: string; userId: string }> };

/** Remove a member (owners/admins) or leave the organization (self). */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const actorId = await requireUser();
    const { id, userId: targetUserId } = await params;
    await removeOrganizationMember(actorId, id, targetUserId);
    await logActivity(actorId, "org_member_removed", {
      orgId: id,
      memberId: targetUserId,
      self: actorId === targetUserId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return asOrgError(error);
  }
}
