import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { addOrganizationMember } from "@/lib/server/organizations";
import { logActivity } from "@/lib/server/activity";
import { asOrgError, serializeMember } from "../../shared";

type Params = { params: Promise<{ id: string }> };

/** Add an existing FileOnChain user to the organization by email. */
export async function POST(request: Request, { params }: Params) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      role?: unknown;
    } | null;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Expected { email }" },
        { status: 400 },
      );
    }
    const role = body?.role === "admin" ? "admin" : "member";

    const member = await addOrganizationMember(userId, id, email, role);
    await logActivity(userId, "org_member_added", {
      orgId: id,
      memberId: member.userId,
      role,
    });
    return NextResponse.json({ member: serializeMember(member) });
  } catch (error) {
    return asOrgError(error);
  }
}
