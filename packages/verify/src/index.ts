import "./adapters-builtin"; // register reference receipt adapters
import "@fileonchain/agent-profile"; // register the Agent Evidence Profile

import {
  isLegacyEvidencePackage,
  parseEnvelope,
  type EvidenceEnvelope,
} from "@fileonchain/protocol";
import { parseEvidencePackage } from "@fileonchain/utils";
import { verifyEnvelope, type VerifyEnvelopeOptions } from "./envelope-verify";
import { verifyLegacyPackage, type VerifyLegacyOptions } from "./legacy";
import { summarize, type VerificationReport } from "./report";

/**
 * @fileonchain/verify — deterministic local verification for FileOnChain
 * evidence. Isomorphic core (browser, Node, edge): EIP-191 via viem,
 * ed25519 via noble-curves, no Node-only crypto. The CLI lives in
 * ./cli.ts; nothing here ever calls a FileOnChain service.
 *
 * Two formats are supported:
 * - Protocol evidence envelopes (`protocol: "fileonchain-evidence"`).
 * - `legacy-evidence-v1` packages (`p: "fileonchain-evidence"`), verified
 *   as-is and migratable via @fileonchain/protocol's
 *   `migrateLegacyEvidence`.
 */

export interface VerifyOptions extends VerifyEnvelopeOptions {
  /** Legacy alias for {@link VerifyEnvelopeOptions.subjectBytes}. */
  artifactBytes?: Uint8Array;
  /** Legacy alias for {@link VerifyEnvelopeOptions.checkReceiptsOnline}. */
  checkSettlements?: boolean;
  /** Legacy alias for {@link VerifyEnvelopeOptions.endpoints}. */
  rpcUrls?: Record<string, string>;
}

/** Detect the format and verify. Accepts raw JSON text. */
export const verifyEvidenceJson = async (
  raw: string,
  options: VerifyOptions = {},
): Promise<VerificationReport> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return summarize(
      [{ name: "schema", group: "schema", status: "fail", detail: "not valid JSON" }],
      false,
    );
  }

  const subjectBytes = options.subjectBytes ?? options.artifactBytes;
  const online = options.checkReceiptsOnline ?? options.checkSettlements ?? false;
  const endpoints = options.endpoints ?? options.rpcUrls;

  if (isLegacyEvidencePackage(parsed)) {
    const pkg = parseEvidencePackage(raw);
    if (!pkg) {
      return summarize(
        [
          {
            name: "schema",
            group: "schema",
            status: "fail",
            detail: "looks like legacy-evidence-v1 but fails its validation",
          },
        ],
        false,
      );
    }
    return verifyLegacyPackage(pkg, {
      artifactBytes: subjectBytes,
      checkSettlements: online,
      rpcUrls: endpoints,
    } satisfies VerifyLegacyOptions);
  }

  const envelope = parseEnvelope(raw);
  if (!envelope) {
    return summarize(
      [
        {
          name: "schema",
          group: "schema",
          status: "fail",
          detail: "not a fileonchain-evidence envelope (nor a legacy-evidence-v1 package)",
        },
      ],
      false,
    );
  }
  return verifyEnvelope(envelope, { subjectBytes, checkReceiptsOnline: online, endpoints });
};

export { verifyEnvelope, type VerifyEnvelopeOptions } from "./envelope-verify";
export { verifyLegacyPackage, type VerifyLegacyOptions } from "./legacy";
export {
  summarize,
  type CheckGroup,
  type CheckResult,
  type CheckStatus,
  type VerificationReport,
  type VerificationStatus,
} from "./report";
export { verifySchemeSignature } from "./signatures";
export {
  anchorAdapter,
  evmAnchorAdapter,
  legacySettlementAdapter,
  legacyStorageAdapter,
  storageAdapter,
} from "./adapters-builtin";
export type { EvidenceEnvelope };
