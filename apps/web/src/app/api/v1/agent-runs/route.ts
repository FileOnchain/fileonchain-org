import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import {
  parseEnvelopeBody,
  type OrgApiKey,
} from "@/lib/server/evidence";
import { submitAgentRun } from "@/lib/server/agent-runs";
import { asRouteError } from "@/lib/auth";
import {
  CLOUD_DISABLED_BODY,
  isCloudEvidenceEnabled,
} from "@/lib/server/cloud-feature";

/**
 * `POST /api/v1/agent-runs` — submit an Agent Evidence envelope. The
 * envelope MUST carry the `org.fileonchain.agent/v1` profile and the
 * required `runId` / `agentId` claims (validated by
 * `@fileonchain/agent-profile` upstream).
 *
 * Server-side sealing (`server_sign: true`) is not implemented in v1;
 * requests that ask for it get a clean 400 rather than a silent no-op.
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
    const raw = await request.json().catch(() => null) as { serverSign?: unknown } | null;
    if (raw?.serverSign === true) {
      return NextResponse.json(
        { error: "server_sign is not implemented in this version" },
        { status: 400 },
      );
    }
    const envelope = await parseEnvelopeBody(request);
    const result = await submitAgentRun(asOrgApiKey(apiKey), { envelope });
    return NextResponse.json(result);
  } catch (error) {
    return asRouteError(error);
  }
}
