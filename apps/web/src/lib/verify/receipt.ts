import type {
  CheckResult,
  CheckStatus,
  EvidenceSummary,
  ReportReceiptLine,
  VerificationInputs,
  VerificationReport,
  VerificationStatus,
} from "@fileonchain/verify";

/**
 * Pure helpers behind `components/verify/ReceiptView.tsx` — the wording
 * and the line-item grouping of the verification receipt, kept free of
 * React so they can be unit-tested under node.
 *
 * The receipt is a rendering of the `VerificationReport` and nothing
 * else: every value it prints comes from `report.checks` or from
 * `report.summary`, which the verifier copies from the document. The
 * helpers here only choose labels and order; they never derive a fact.
 */

/** The stamped overall status. The verifier's exact status, in receipt voice. */
export const STAMP_LABEL: Record<VerificationStatus, string> = {
  valid: "VALID",
  "valid-with-warnings": "VALID · WARNINGS",
  incomplete: "INCOMPLETE",
  invalid: "INVALID",
};

/** Per-check tag. `unknown` prints as UNKNOWN — never as a failure. */
export const CHECK_TAG: Record<CheckStatus, string> = {
  pass: "PASS",
  fail: "FAIL",
  warning: "WARN",
  unknown: "UNKNOWN",
  skipped: "SKIP",
};

/**
 * The receipt's sections, in print order. Artifact signatures (who
 * signed the subject) and envelope signatures (who assembled the
 * envelope) are separate sections by design and must never be merged.
 * Receipt groups are rendered from `summary.receipts` as line items; the
 * `receipts` flag marks that section.
 */
export const RECEIPT_SECTIONS: {
  title: string;
  groups: CheckResult["group"][];
  receipts?: true;
}[] = [
  { title: "Subject integrity", groups: ["subject"] },
  { title: "Schema & claims", groups: ["schema", "claims"] },
  { title: "Artifact signatures · who signed", groups: ["artifact-signatures"] },
  { title: "Envelope", groups: ["envelope"] },
  { title: "Envelope signatures · who assembled", groups: ["envelope-signatures"] },
  {
    title: "Receipts",
    groups: ["storage-receipts", "settlement-receipts", "inclusion-receipts"],
    receipts: true,
  },
  { title: "Key status", groups: ["key-status"] },
];

/**
 * The exact CLI invocation that reproduces this report. `subjectBytes`
 * and `online` come from the report's own inputs; file names are the
 * caller's (the receipt cannot know what the user named the files), so
 * they default to the documented placeholders.
 */
export const buildVerifyCommand = (
  inputs: VerificationInputs,
  envelopeFile = "evidence.json",
  subjectFile = "<subject-bytes>",
): string => {
  const parts = ["fileonchain", "verify", envelopeFile];
  if (inputs.subjectBytes) parts.push("--artifact", subjectFile);
  if (inputs.online) parts.push("--online");
  return parts.join(" ");
};

/** The checks the verifier emitted for one receipt line (`<line.name>` or `<line.name>:<phase>`). */
export const checksForReceiptLine = (
  report: VerificationReport,
  line: ReportReceiptLine,
): CheckResult[] =>
  report.checks.filter((c) => c.name === line.name || c.name.startsWith(`${line.name}:`));

/** The phase suffix of a receipt check (`offline`, `online`), or the bare name. */
export const receiptCheckPhase = (line: ReportReceiptLine, check: CheckResult): string =>
  check.name.startsWith(`${line.name}:`) ? check.name.slice(line.name.length + 1) : check.name;

/**
 * File name for the downloaded PNG: the subject name when the envelope
 * carries one, with the status appended so several receipts of the same
 * subject stay distinguishable on disk.
 */
export const receiptFileName = (report: VerificationReport, extension = "png"): string => {
  const base = report.summary?.subject.name
    ?.replace(/[^\w.-]+/g, "-")
    .replace(/-+\./g, ".")
    .replace(/^-+|-+$/g, "");
  const stem = base && base.length > 0 ? base : "evidence";
  return `${stem}.receipt.${report.status}.${extension}`;
};

/** Footer identity lines, in print order. Missing values are printed as such, never invented. */
export const footerLines = (summary: EvidenceSummary): { label: string; value: string }[] => [
  { label: "envelope digest", value: summary.envelopeDigest ?? "none (draft)" },
  { label: "protocol", value: `${summary.protocol} v${summary.version}` },
  {
    label: "profile",
    value: summary.profile
      ? summary.profileKnown === false
        ? `${summary.profile} (UNKNOWN to this verifier)`
        : summary.profile
      : "none",
  },
  { label: "artifact signatures", value: String(summary.artifactSignatures) },
  { label: "envelope signatures", value: String(summary.envelopeSignatures) },
];

/**
 * Decorative bar pattern derived from a hex digest — the receipt's
 * "barcode". Purely visual: 32 bars whose widths follow the digest's
 * nibbles, so two different envelopes never print the same strip. Returns
 * an empty list when no digest is available rather than inventing one.
 */
export const digestBars = (hex: string | undefined, count = 32): number[] => {
  if (!hex) return [];
  const clean = hex.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean) || clean.length === 0) return [];
  const bars: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const nibble = parseInt(clean[i % clean.length]!, 16);
    bars.push(1 + (nibble % 4));
  }
  return bars;
};
