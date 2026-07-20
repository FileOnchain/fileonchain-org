import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser, asRouteError } from "@/lib/auth";
import {
  CLOUD_TENANCY_DISABLED_BODY,
  isCloudTenancyEnabled,
} from "@/lib/server/cloud-feature";
import { addProjectMember } from "@/lib/server/projects";
import { db, users } from "@/lib/db";
import { logActivity } from "@/lib/server/activity";
import { HttpError } from "@/lib/server/http-error";

export async function POST(
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
      email?: unknown;
      role?: unknown;
    } | null;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email) {
      throw new HttpError(400, "Expected { email }", "bad_request");
    }
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (!target) throw new HttpError(404, "User not found", "not_found");
    const role =
      body?.role === "lead" || body?.role === "contributor"
        ? body.role
        : "contributor";
    const member = await addProjectMember(userId, id, target.id, role);
    await logActivity(userId, "project_member_added", {
      projectId: id,
      targetUserId: target.id,
      role,
    });
    return NextResponse.json({ member });
  } catch (error) {
    return asRouteError(error);
  }
}
