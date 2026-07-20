import { NextResponse } from "next/server";
import { getProjectSignerStatus } from "@/lib/server/cloud-signer";
import { asRouteError } from "@/lib/auth";

/** `GET /api/cloud/signer/project/[projectId]` — public key-status
 *  endpoint for a project's Cloud signer. Unauthenticated: public keys
 *  are public. 404 when the project has never had a signer. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const status = await getProjectSignerStatus(projectId);
    if (!status) {
      return NextResponse.json(
        { error: "No Cloud signer for this project" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      projectId,
      publicKey: status.publicKey,
      scheme: status.scheme,
      keyPreview: status.keyPreview,
      status: status.revokedAt ? "revoked" : "active",
      createdAt: status.createdAt,
      revokedAt: status.revokedAt,
    });
  } catch (error) {
    return asRouteError(error);
  }
}
