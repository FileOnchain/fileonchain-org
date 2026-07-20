import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import { getAgentRun } from "@/lib/server/agent-runs";
import { type OrgApiKey } from "@/lib/server/evidence";
import { asRouteError } from "@/lib/auth";
import {
  CLOUD_DISABLED_BODY,
  isCloudEvidenceEnabled,
} from "@/lib/server/cloud-feature";

/**
 * `GET /api/v1/agent-runs/:runId` — run-centric view: returns the agent
 * run plus every envelope sealed under it. 404 when no row exists for
 * the caller's org.
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
  { params }: { params: Promise<{ runId: string }> },
) {
  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json(CLOUD_DISABLED_BODY, { status: 503 });
  }
  const apiKey = await authenticateApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const { runId } = await params;
    const result = await getAgentRun(asOrgApiKey(apiKey), runId);
    return NextResponse.json({
      runId: result.runId,
      agentId: result.agentId,
      envelopes: result.envelopes.map((e) => ({
        envelopeId: e.id,
        envelopeDigest: e.envelopeDigest,
        profile: e.profile,
        subjectSha256: e.subjectSha256,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return asRouteError(error);
  }
}
