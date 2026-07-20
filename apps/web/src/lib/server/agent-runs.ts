import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { HttpError } from "@/lib/server/http-error";
import { logActivity } from "@/lib/server/activity";
import {
  db,
  agentRuns,
  evidenceEnvelopes,
} from "@/lib/db";
import {
  submitEvidence,
  requireOrgApiKey,
  type OrgApiKey,
  type SubmitEvidenceInput,
} from "@/lib/server/evidence";
import type { EvidenceEnvelope } from "@fileonchain/verify";

export type { EvidenceEnvelope };

/**
 * Agent-run service — wraps the Cloud evidence store with run-shaped reads
 * and a convenience submit that validates the envelope carries an
 * `org.fileonchain.agent` profile. When `serverSign` is set the Cloud adds
 * an envelope signature with the org's `service` signer (see
 * `lib/server/cloud-signer.ts`) before storage.
 *
 * Every envelope stored through this path is also a row in
 * `evidence_envelope` — there is no second copy. The agent-run row is
 * just the `(runId, agentId, envelopeId)` join key plus an audit trail.
 */

/** Inputs for `submitAgentRun`. `serverSign` opts into Cloud envelope
 *  sealing with the org's `service` signer. */
export interface SubmitAgentRunInput {
  envelope: EvidenceEnvelope;
  serverSign?: boolean;
}

export const submitAgentRun = async (
  apiKey: OrgApiKey,
  { envelope, serverSign = false }: SubmitAgentRunInput,
) => {
  const orgId = requireOrgApiKey(apiKey);

  // The envelope MUST carry the Agent Evidence Profile id so the run row
  // is meaningful. We validate this before storage so a misuse gets a 400,
  // not a silently-misclassified envelope.
  if (envelope.profile !== "org.fileonchain.agent/v1") {
    throw new HttpError(
      400,
      "Agent-run submission requires an envelope with profile 'org.fileonchain.agent/v1'",
      "bad_request",
    );
  }

  // Pull runId + agentId from the agent claims namespace. The profile
  // guarantees the namespace + required keys at validation time (see
  // `validateAgentClaims` in @fileonchain/agent-profile).
  const runClaims = (envelope.claims as Record<string, Record<string, unknown>> | undefined)?.[
    "org.fileonchain.agent"
  ];
  const runId = typeof runClaims?.runId === "string" ? runClaims.runId : null;
  const agentId = typeof runClaims?.agentId === "string" ? runClaims.agentId : null;
  if (!runId || !agentId) {
    throw new HttpError(
      400,
      "Agent claims must include runId and agentId",
      "bad_request",
    );
  }

  const submit = await submitEvidence(apiKey, {
    envelope,
    serverSign,
  } as SubmitEvidenceInput);

  const runRowId = crypto.randomUUID();
  try {
    await db.insert(agentRuns).values({
      id: runRowId,
      orgId,
      userId: apiKey.userId,
      runId,
      agentId,
      envelopeId: submit.envelopeId,
    });
  } catch {
    // The unique index on (orgId, runId, envelopeId) catches duplicate
    // resubmits — same caller, same run, same envelope. Surface that as
    // 409 rather than a generic 500.
    throw new HttpError(
      409,
      `Agent run already recorded for runId=${runId} agentId=${agentId}`,
      "conflict",
    );
  }

  await logActivity(apiKey.userId, "agent_run_sealed", {
    envelopeId: submit.envelopeId,
    runId,
    agentId,
  });

  return { runId, agentId, envelopeId: submit.envelopeId };
};

/** Return one agent run + the envelopes sealed under it. 404 when the run
 *  does not exist in the caller's org. */
export const getAgentRun = async (
  apiKey: OrgApiKey,
  runId: string,
) => {
  const orgId = requireOrgApiKey(apiKey);
  const runs = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.orgId, orgId), eq(agentRuns.runId, runId)))
    .orderBy(desc(agentRuns.createdAt));
  if (runs.length === 0) {
    throw new HttpError(404, "Agent run not found", "not_found");
  }
  const envelopeIds = runs.map((r) => r.envelopeId);
  const envelopes = await db
    .select()
    .from(evidenceEnvelopes)
    .where(
      and(
        inArray(evidenceEnvelopes.id, envelopeIds),
        eq(evidenceEnvelopes.orgId, orgId),
      ),
    );
  return { runId, agentId: runs[0]!.agentId, envelopes };
};
