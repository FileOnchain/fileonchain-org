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

export interface VerificationReport {
  status: VerificationStatus;
  /** Convenience flag: true unless status is "invalid". */
  ok: boolean;
  checks: CheckResult[];
}

/**
 * Derive the overall status: any failure → invalid; any check marked
 * `incomplete` by the caller (passed via the second argument) →
 * incomplete; any warning/unknown → valid-with-warnings; else valid.
 */
export const summarize = (
  checks: CheckResult[],
  incomplete: boolean,
): VerificationReport => {
  const status: VerificationStatus = checks.some((c) => c.status === "fail")
    ? "invalid"
    : incomplete
      ? "incomplete"
      : checks.some((c) => c.status === "warning" || c.status === "unknown")
        ? "valid-with-warnings"
        : "valid";
  return { status, ok: status !== "invalid", checks };
};
