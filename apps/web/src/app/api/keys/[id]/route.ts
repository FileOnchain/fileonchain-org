import { NextResponse } from "next/server";
import { requireUser, asRouteError } from "@/lib/auth";
import { revokeApiKey } from "@/lib/server/api-keys";
import { logActivity } from "@/lib/server/activity";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const revoked = await revokeApiKey(userId, id);
    if (!revoked) {
      return NextResponse.json(
        { error: "Key not found or already revoked" },
        { status: 404 },
      );
    }
    await logActivity(userId, "api_key_revoked", {
      keyId: revoked.id,
      prefix: revoked.prefix,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return asRouteError(error);
  }
}
