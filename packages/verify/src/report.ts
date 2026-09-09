/**
 * Structured verification results.
 *
 * A report never hides uncertainty behind a single green "verified":
 * every check carries a group, a status, and a human-readable detail, and
 * the overall status distinguishes *invalid* (something failed) from
 * *incomplete* (essential parts are missing or unchecked) from
 * *valid-with-warnings* (verified, with unknowns a relying party should
 * see) from *valid*.
 */

export type CheckStatus = "pass" | "fail" | "warning" | "unknown" | "skipped";

export type CheckGroup =
  | "schema"
  | "subject"
  | "claims"
  | "artifact-signatures"
  | "envelope"
  | "envelope-signatures"
  | "storage-receipts"
  | "settlement-receipts"
  | "inclusion-receipts"
  | "key-status";

export interface CheckResult {
  /** Stable check identifier, e.g. "subject-sha256", "signature[0]". */
  name: string;
  group: CheckGroup;
  status: CheckStatus;
  detail: string;
}

export type VerificationStatus =
  | "valid"
  | "valid-with-warnings"
  | "incomplete"
  | "invalid";

/**
 * What the verifier was asked to do. Enough to reproduce the report with
 * the CLI (`fileonchain verify <file> [--artifact <bytes>] [--online]`).
 */
export interface VerificationInputs {
  /** Subject bytes were supplied, so integrity was recomputed locally. */
  subjectBytes: boolean;
  /** Receipts were confirmed online through their adapters. */
  online: boolean;
}

/** The subject, as the envelope describes it. Every field is copied verbatim. */
export interface ReportSubject {
  type: string;
  name?: string;
  sha256?: string;
  cid?: string;
  uri?: string;
  mediaType?: string;
  size?: number;
}

/**
 * One receipt, as a line item. `name` is the prefix of every check the
 * verifier emitted for this receipt (`<type>[<i>]:<adapter>`), so a
 * renderer can pair the line with its offline/online outcomes. Payload
 * fields are copied verbatim from the receipt when the adapter's payload
 * carries them; nothing is derived or reworded.
 */
export interface ReportReceiptLine {
  name: string;
  type: "storage" | "settlement" | "inclusion";
  adapter: string;
  /** False when no adapter is registered — the receipt was preserved, not checked. */
  adapterKnown: boolean;
  system?: string;
  txHash?: string;
  blockNumber?: number;
  /** Asserted time carried by the receipt payload (ISO 8601). */
  timestamp?: string;
  uri?: string;
  root?: string;
}

/**
 * A compact description of what was verified, built by the verifier from
 * the document itself. It exists so a report can be rendered on its own,
 * as a receipt or a card, without re-reading the envelope: every value is
 * copied from the verified document, never computed by a renderer.
 * Absent when the document failed to parse.
 */
export interface EvidenceSummary {
  /** `"envelope"` for protocol envelopes, `"legacy-evidence-v1"` for pre-separation packages. */
  format: "envelope" | "legacy-evidence-v1";
  protocol: string;
  version: number;
  id?: string;
  profile?: string;
  /** False when the profile is not registered — its claims were not validated. */
  profileKnown?: boolean;
  /** Producer-asserted creation time (ISO 8601). Claimed, not proven. */
  createdAt?: string;
  subject: ReportSubject;
  /** The finalized envelope digest. Absent on drafts and legacy packages. */
  envelopeDigest?: string;
  /** Count of artifact signatures — who signed the subject. */
  artifactSignatures: number;
  /** Count of envelope signatures — who assembled the envelope. Kept apart from artifact signatures. */
  envelopeSignatures: number;
  receipts: ReportReceiptLine[];
  inputs: VerificationInputs;
}

export interface VerificationReport {
  status: VerificationStatus;
  /**
   * Convenience flag: true unless status is "invalid". `ok` means "not
   * malformed" — nothing checked has failed. It does NOT mean anyone
   * attested to the content; see {@link attested} for that.
   */
  ok: boolean;
  /**
   * True iff at least one artifact or envelope signature verified
   * cryptographically. `ok && !attested` describes a well-formed but
   * unattested document: integrity and timestamps only, no attribution.
   */
  attested: boolean;
  checks: CheckResult[];
  /** What was verified, copied from the document. See {@link EvidenceSummary}. */
  summary?: EvidenceSummary;
}

/**
 * Derive the overall status: any failure → invalid; any check marked
 * `incomplete` by the caller (passed via the second argument) →
 * incomplete; any warning/unknown → valid-with-warnings; else valid.
 * `attested` is derived from the signature groups: only a passing
 * artifact or envelope signature check counts as attestation.
 */
export const summarize = (
  checks: CheckResult[],
  incomplete: boolean,
  summary?: EvidenceSummary,
): VerificationReport => {
  const status: VerificationStatus = checks.some((c) => c.status === "fail")
    ? "invalid"
    : incomplete
      ? "incomplete"
      : checks.some((c) => c.status === "warning" || c.status === "unknown")
        ? "valid-with-warnings"
        : "valid";
  const attested = checks.some(
    (c) =>
      c.status === "pass" &&
      (c.group === "artifact-signatures" || c.group === "envelope-signatures"),
  );
  return {
    status,
    ok: status !== "invalid",
    attested,
    checks,
    ...(summary ? { summary } : {}),
  };
};
