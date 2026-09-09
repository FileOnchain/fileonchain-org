import type { EvidenceEnvelope, VerificationReport } from "@fileonchain/verify";
import { getChain } from "@fileonchain/sdk";

/**
 * A compact, share-friendly digest of a verification report — the
 * numbers the social card (`/api/og/verify`) and the badge
 * (`/api/badge`) print. Pure and client-safe so the same summary can be
 * unit-tested and reused by the in-browser panel.
 *
 * Deliberately keeps artifact signatures and envelope signatures apart:
 * who signed the subject is a different fact from who assembled the
 * envelope, and the card must never fold them into one "signed" count.
 */
export interface ReportSummary {
  status: VerificationReport["status"];
  /** Human label for the status — same wording as the report chip. */
  statusLabel: string;
  checks: { total: number; pass: number; fail: number; warning: number; unknown: number; skipped: number };
  receipts: { storage: number; settlement: number; inclusion: number; total: number };
  /** Display names of the settlement systems that carry a receipt (deduplicated, in envelope order). */
  settlementSystems: string[];
  /** Artifact signatures — who signed the subject. */
  artifactSigners: number;
  /** Envelope signatures — who assembled the envelope. */
  envelopeSigners: number;
  /** Application profile in force, when any. */
  profile: string | null;
  /** Subject descriptor bits worth printing. */
  subject: { name: string | null; sha256: string | null; type: string };
}

export const STATUS_LABEL: Record<VerificationReport["status"], string> = {
  valid: "Valid",
  "valid-with-warnings": "Valid with warnings",
  incomplete: "Incomplete",
  invalid: "Invalid",
};

/**
 * Resolve a receipt's `system` (CAIP-2 for EVM, the registry chain id
 * elsewhere) to the registry's display name, falling back to the raw
 * identifier so an unknown system is still shown — never hidden.
 */
export const settlementSystemName = (system: string): string => {
  const evm = system.match(/^eip155:(.+)$/);
  const chain = getChain(evm ? `evm:${evm[1]}` : system);
  return chain?.name ?? system;
};

/**
 * `envelope` is null for a legacy-evidence-v1 package (verifiable, but
 * not a protocol envelope) — the summary then carries the report's
 * status and check counts with everything else at zero.
 */
export const summarizeReport = (
  envelope: EvidenceEnvelope | null,
  report: VerificationReport,
): ReportSummary => {
  const counts = { total: report.checks.length, pass: 0, fail: 0, warning: 0, unknown: 0, skipped: 0 };
  for (const check of report.checks) counts[check.status] += 1;

  const receipts = envelope?.receipts ?? { storage: [], settlement: [], inclusion: [] };
  const storage = receipts.storage?.length ?? 0;
  const settlement = receipts.settlement?.length ?? 0;
  const inclusion = receipts.inclusion?.length ?? 0;

  const settlementSystems = Array.from(
    new Set((receipts.settlement ?? []).map((r) => settlementSystemName(r.system))),
  );

  return {
    status: report.status,
    statusLabel: STATUS_LABEL[report.status],
    checks: counts,
    receipts: { storage, settlement, inclusion, total: storage + settlement + inclusion },
    settlementSystems,
    artifactSigners: envelope?.signatures?.length ?? 0,
    envelopeSigners: envelope?.envelope?.signatures?.length ?? 0,
    profile: envelope?.profile ?? null,
    subject: {
      name: envelope?.subject?.name ?? null,
      sha256: envelope?.subject?.digests?.sha256 ?? null,
      type: envelope?.subject?.type ?? "artifact",
    },
  };
};
