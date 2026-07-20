import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import {
  parseEnvelopeBody,
  searchEvidence,
  submitEvidence,
  type OrgApiKey,
} from "@/lib/server/evidence";
import { asRouteError } from "@/lib/auth";
import {
  CLOUD_DISABLED_BODY,
  isCloudEvidenceEnabled,
} from "@/lib/server/cloud-feature";

/**
 * `POST /api/v1/evidence` — submit a sealed envelope. Hash-only by
 * default; the body carries an `EvidenceEnvelope` JSON, never the
 * artifact bytes.
 *
 * `GET /api/v1/evidence?query=…&limit=…` — claim-level search across the
 * org's envelopes. Empty `query` returns the most recent 20.
 *
 * Both endpoints require an org-scoped API key (`orgId != NULL`). Personal
 * keys get `403 org_scoped_key_required`.
 */

const asOrgApiKey = (row: NonNullable<Awaited<ReturnType<typeof authenticateApiKey>>>): OrgApiKey => ({
  id: row.id,
  userId: row.userId,
  orgId: row.orgId,
  scope: row.scope,
});

export async function POST(request: Request) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const envelope = await parseEnvelopeBody(request);
    const result = await submitEvidence(asOrgApiKey(apiKey), { envelope });
    return NextResponse.json({
      envelopeId: result.envelopeId,
      envelope: result.envelope,
      envelopeDigest: result.envelopeDigest,
    });
  } catch (error) {
    return asRouteError(error);
  }
}

export async function GET(request: Request) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? "";
    const limitParam = Number(url.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitParam) ? limitParam : 20;
    const hits = await searchEvidence(asOrgApiKey(apiKey), query, { limit });
    return NextResponse.json({ hits });
  } catch (error) {
    return asRouteError(error);
  }
}
