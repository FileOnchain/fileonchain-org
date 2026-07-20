import "server-only";
import { eq } from "drizzle-orm";
import type { EvidenceEnvelope, VerificationReport } from "@fileonchain/verify";
import { verifyEnvelope, verifyEvidenceJson } from "@fileonchain/verify";
import { HttpError } from "@/lib/server/http-error";
import { logActivity } from "@/lib/server/activity";
import { enqueueWebhookDeliveries } from "@/lib/server/webhooks";
import { db, evidenceEnvelopes } from "@/lib/db";
import {
  requireOrgApiKey,
  type OrgApiKey,
} from "@/lib/server/evidence";

/**
 * Server-side verification harness. Two request shapes:
 *  A. `{ envelopeId, subjectBytes?, checkReceiptsOnline? }` — the server
 *     fetches the envelope from `evidence_envelope`, enforces ownership
 *     against the API key's org, runs the open verifier, and increments
 *     `verification_count` + stamps `last_verified_at` on the row.
 *  B. `{ envelope, subjectBytes?, checkReceiptsOnline? }` — the caller
 *     supplies the envelope; no DB lookup, no ownership check, no
 *     verification count bump (the envelope is not ours).
 *
 * The verifier is isomorphic (viem + noble-curves, no node:crypto), so the
 * route imports it directly. The client panel at `/verify` dynamic-imports
 * the same package to keep viem out of the initial bundle — server routes
 * have no such constraint.
 *
 * The returned `VerificationReport` shape is exactly the package's. The
 * route handler and the hosted page both render it verbatim — collapsing
 * to one green "verified" would hide uncertainty, which the project's
 * verification-report voice forbids.
 */

export interface VerifyByEnvelopeId {
  envelopeId: string;
  subjectBytes?: Uint8Array;
  checkReceiptsOnline?: boolean;
}

export interface VerifyByEnvelope {
  envelope: EvidenceEnvelope;
  subjectBytes?: Uint8Array;
  checkReceiptsOnline?: boolean;
}

export type ServerVerifyBody = VerifyByEnvelopeId | VerifyByEnvelope;

const isEnvelopeIdBody = (b: ServerVerifyBody): b is VerifyByEnvelopeId =>
  typeof (b as VerifyByEnvelopeId).envelopeId === "string";

export const runServerVerify = async (
  apiKey: OrgApiKey,
  body: ServerVerifyBody,
): Promise<VerificationReport> => {
  if (isEnvelopeIdBody(body)) {
    const orgId = requireOrgApiKey(apiKey);
    const [row] = await db
      .select()
      .from(evidenceEnvelopes)
      .where(
        eq(evidenceEnvelopes.id, body.envelopeId),
      )
      .limit(1);
    if (!row || row.orgId !== orgId) {
      // No info leak across orgs — same shape as a genuine 404.
      throw new HttpError(404, "Envelope not found", "not_found");
    }

    const report = await verifyEnvelope(row.envelope as EvidenceEnvelope, {
      ...(body.subjectBytes ? { subjectBytes: body.subjectBytes } : {}),
      ...(body.checkReceiptsOnline !== undefined
        ? { checkReceiptsOnline: body.checkReceiptsOnline }
        : {}),
    });

    // Bump counters best-effort — never let an audit write mask a real
    // verifier outcome. The verification itself already succeeded above.
    try {
      await db
        .update(evidenceEnvelopes)
        .set({
          verificationCount: row.verificationCount + 1,
          lastVerifiedAt: new Date(),
        })
        .where(eq(evidenceEnvelopes.id, body.envelopeId));
    } catch (error) {
      console.error("Failed to bump verification count", { error });
    }

    await logActivity(apiKey.userId, "evidence_verified", {
      envelopeId: body.envelopeId,
      status: report.status,
    });

    // Webhook fan-out (case A only — case B has no DB row to attribute).
    void enqueueWebhookDeliveries(row.orgId, "evidence.verified", row.id, {
      envelopeId: row.id,
      status: report.status,
    });

    return report;
  }

  // Case B — caller-supplied envelope. No DB lookup, no counter bump.
  return verifyEnvelope(body.envelope, {
    ...(body.subjectBytes ? { subjectBytes: body.subjectBytes } : {}),
    ...(body.checkReceiptsOnline !== undefined
      ? { checkReceiptsOnline: body.checkReceiptsOnline }
      : {}),
  });
};

/** Convenience for the hosted page — accepts a JSON string (so the page
 *  can hand us the raw envelope text), uses `verifyEvidenceJson` so legacy
 *  envelopes also work. Does NOT touch the DB. */
export const verifyEnvelopeJson = async (
  raw: string,
  options?: { subjectBytes?: Uint8Array; checkReceiptsOnline?: boolean },
): Promise<VerificationReport> =>
  verifyEvidenceJson(raw, options ?? {});
