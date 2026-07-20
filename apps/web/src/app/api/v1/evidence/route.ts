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
 * artifact bytes. Pass `?server_sign=1` (or header
 * `x-fileonchain-server-sign: 1`) to have the Cloud add an envelope
 * signature with the org's `service` signer (409 if none is active).
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

/** Read the server-sign opt-in from `?server_sign=` or the header. */
const wantsServerSign = (request: Request): boolean => {
  const url = new URL(request.url);
  const q = url.searchParams.get("server_sign");
  if (q === "1" || q === "true") return true;
  const header = request.headers.get("x-fileonchain-server-sign");
  return header === "1" || header === "true";
};

export async function POST(request: Request) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const serverSign = wantsServerSign(request);
    const envelope = await parseEnvelopeBody(request);
    const result = await submitEvidence(asOrgApiKey(apiKey), {
      envelope,
      serverSign,
    });
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
