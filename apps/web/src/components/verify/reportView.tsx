import * as React from "react";
import { FiCheck, FiX, FiAlertTriangle, FiHelpCircle, FiMinus } from "react-icons/fi";
import type {
  CheckGroup,
  CheckStatus,
  VerificationStatus,
} from "@fileonchain/verify";

/**
 * Shared report-view constants used by both the in-browser `/verify` page
 * (`VerifyPanel.tsx`) and the hosted `/cloud/verify/[envelopeId]` page
 * (`components/cloud/verify/VerifyReportPanel.tsx`). Extracted so the two
 * surfaces render the same chip wording and the same six grouped sections —
 * a user can compare `/verify` and `/cloud/verify/[id]` output side by
 * side without learning two report shapes.
 *
 * The overall chip always shows the verifier's exact status — "Valid",
 * "Valid with warnings", "Incomplete", "Invalid" — never a single green
 * "verified" that would hide uncertainty.
 */

export const OVERALL: Record<
  VerificationStatus,
  { label: string; className: string }
> = {
  valid: {
    label: "Valid",
    className: "bg-success/10 text-success border-success/30",
  },
  "valid-with-warnings": {
    label: "Valid with warnings",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  incomplete: {
    label: "Incomplete",
    className: "bg-info/10 text-info border-info/30",
  },
  invalid: {
    label: "Invalid",
    className: "bg-danger/10 text-danger border-danger/30",
  },
};

export const STATUS_ICON: Record<
  CheckStatus,
  { Icon: React.ElementType; className: string; label: string }
> = {
  pass: { Icon: FiCheck, className: "text-success", label: "Pass" },
  fail: { Icon: FiX, className: "text-danger", label: "Fail" },
  warning: { Icon: FiAlertTriangle, className: "text-warning", label: "Warning" },
  unknown: { Icon: FiHelpCircle, className: "text-muted", label: "Unknown" },
  skipped: { Icon: FiMinus, className: "text-muted/60", label: "Skipped" },
};

/** The report's ten check groups, folded into six plain-language sections. */
export const SECTIONS: { title: string; caption: string; groups: CheckGroup[] }[] = [
  {
    title: "Schema, claims & envelope",
    caption:
      "The envelope is well-formed, its application-profile claims validate, and the envelope digest matches its canonical encoding.",
    groups: ["schema", "claims", "envelope"],
  },
  {
    title: "Subject integrity",
    caption:
      "The subject's SHA-256 digest — recomputed bit-for-bit when you supply the original bytes.",
    groups: ["subject"],
  },
  {
    title: "Artifact signatures — who signed",
    caption:
      "Who made or approved the subject. Claimed identities and delegations are part of these checks: a key is proven, the identity behind it is claimed.",
    groups: ["artifact-signatures"],
  },
  {
    title: "Envelope signatures — who assembled",
    caption:
      "Who put the evidence together — verified separately from who made the artifact.",
    groups: ["envelope-signatures"],
  },
  {
    title: "Receipts",
    caption:
      "Storage, settlement, and inclusion receipts — each one checkable on its own public system.",
    groups: ["storage-receipts", "settlement-receipts", "inclusion-receipts"],
  },
  {
    title: "Key status",
    caption:
      "Whether signing keys declare a status endpoint. A signature alone cannot prove a key was never revoked, so this may honestly be unknown.",
    groups: ["key-status"],
  },
];
