import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import {
  getEnvelopeById,
  type OrgApiKey,
} from "@/lib/server/evidence";
import { asRouteError } from "@/lib/auth";
import {
  CLOUD_DISABLED_BODY,
  isCloudEvidenceEnabled,
} from "@/lib/server/cloud-feature";

/**
 * `GET /api/v1/evidence/:id` — fetch one sealed envelope by id. Returns
 * the canonical envelope JSON the row was stored with, plus the derived
 * envelope digest and metadata. 404 when the envelope is not in the
 * caller's org (no info leak across orgs).
 */

const asOrgApiKey = (row: NonNullable<Awaited<ReturnType<typeof authenticateApiKey>>>): OrgApiKey => ({
  id: row.id,
  userId: row.userId,
  orgId: row.orgId,
  projectId: row.projectId,
  scope: row.scope,
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const row = await getEnvelopeById(asOrgApiKey(apiKey), id);
    return NextResponse.json({
      envelopeId: row.id,
      envelope: row.envelope,
      envelopeDigest: row.envelopeDigest,
      profile: row.profile,
      subjectSha256: row.subjectSha256,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      verificationCount: row.verificationCount,
    });
  } catch (error) {
    return asRouteError(error);
  }
}
