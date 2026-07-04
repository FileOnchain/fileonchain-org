import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  deleteOrganization,
  getOrganization,
  renameOrganization,
} from "@/lib/server/organizations";
import { logActivity } from "@/lib/server/activity";
import { asOrgError, serializeOrgDetail } from "../shared";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const organization = await getOrganization(userId, id);
    return NextResponse.json({
      organization: serializeOrgDetail(organization),
    });
  } catch (error) {
    return asOrgError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 64) {
      return NextResponse.json(
        { error: "Expected { name } (1–64 chars)" },
        { status: 400 },
      );
    }

    await renameOrganization(userId, id, name);
    await logActivity(userId, "org_renamed", { orgId: id, name });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return asOrgError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    await deleteOrganization(userId, id);
    await logActivity(userId, "org_deleted", { orgId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return asOrgError(error);
  }
}
