import { NextResponse } from "next/server";
import { getOrgSignerStatus } from "@/lib/server/cloud-signer";
import { asRouteError } from "@/lib/auth";

/**
 * `GET /api/cloud/signer/[orgId]` — public key-status endpoint for the org's
 * Cloud signer. Unauthenticated: a signer's public key is public, and this
 * is the `keyStatusUrl` that verifiers resolve to check rotation/revocation
 * of a `service` envelope signature. Never returns secret material.
 *
 * 404 when the org has never had a Cloud signer; otherwise reports the most
 * recent key with `status: "active" | "revoked"`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params;
    const status = await getOrgSignerStatus(orgId);
    if (!status) {
      return NextResponse.json(
        { error: "No Cloud signer for this organization" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      orgId,
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
