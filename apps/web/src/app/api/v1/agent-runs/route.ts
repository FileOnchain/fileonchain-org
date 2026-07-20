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
 * Server-side sealing: pass `?server_sign=1` (or header
 * `x-fileonchain-server-sign: 1`) and the Cloud adds an envelope signature
 * with the org's `service` signer. The flag rides on the query/header, not
 * the JSON body, so the body stays the pure envelope and is read once.
 * Returns 409 when the org has no active Cloud signer.
 */

const asOrgApiKey = (row: NonNullable<Awaited<ReturnType<typeof authenticateApiKey>>>): OrgApiKey => ({
  id: row.id,
  userId: row.userId,
  orgId: row.orgId,
  projectId: row.projectId,
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
    const result = await submitAgentRun(asOrgApiKey(apiKey), {
      envelope,
      serverSign,
    });
    return NextResponse.json(result);
  } catch (error) {
    return asRouteError(error);
  }
}
