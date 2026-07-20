import { NextResponse } from "next/server";
import { requireUser, asRouteError } from "@/lib/auth";
import { createProject } from "@/lib/server/projects";
import { logActivity } from "@/lib/server/activity";
import {
  CLOUD_TENANCY_DISABLED_BODY,
  isCloudTenancyEnabled,
} from "@/lib/server/cloud-feature";
import { HttpError } from "@/lib/server/http-error";

/** `POST /api/organizations/[id]/projects` — create a project under
 *  the org. The caller becomes its first `lead`. */
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
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 64) {
      throw new HttpError(400, "Expected { name } (1-64 chars)", "bad_request");
    }
    const project = await createProject(userId, id, name);
    await logActivity(userId, "project_created", {
      orgId: id,
      projectId: project.id,
      name: project.name,
    });
    return NextResponse.json({ project });
  } catch (error) {
    return asRouteError(error);
  }
}
