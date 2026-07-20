import { NextResponse } from "next/server";
import { requireUser, asRouteError } from "@/lib/auth";
import {
  CLOUD_TENANCY_DISABLED_BODY,
  isCloudTenancyEnabled,
} from "@/lib/server/cloud-feature";
import { deleteProject, renameProject } from "@/lib/server/projects";
import { logActivity } from "@/lib/server/activity";
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
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 64) {
      throw new HttpError(400, "Expected { name } (1-64 chars)", "bad_request");
    }
    await renameProject(userId, id, name);
    await logActivity(userId, "project_renamed", { projectId: id, name });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return asRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCloudTenancyEnabled()) {
    return NextResponse.json(CLOUD_TENANCY_DISABLED_BODY, { status: 503 });
  }
  try {
    const userId = await requireUser();
    const { id } = await params;
    await deleteProject(userId, id);
    await logActivity(userId, "project_deleted", { projectId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return asRouteError(error);
  }
}
