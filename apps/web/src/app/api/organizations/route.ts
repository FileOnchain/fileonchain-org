import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  createOrganization,
  listOrganizations,
} from "@/lib/server/organizations";
import { logActivity } from "@/lib/server/activity";
import { asOrgError, serializeOrg } from "./shared";

export async function GET() {
  try {
    const userId = await requireUser();
    const organizations = await listOrganizations(userId);
    return NextResponse.json({
      organizations: organizations.map(serializeOrg),
    });
  } catch (error) {
    return asOrgError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUser();
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

    const organization = await createOrganization(userId, name);
    await logActivity(userId, "org_created", {
      orgId: organization.id,
      name,
    });
    return NextResponse.json({ organization: serializeOrg(organization) });
  } catch (error) {
    return asOrgError(error);
  }
}
