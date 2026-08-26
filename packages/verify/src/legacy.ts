import {
  buildTxUrl,
  getChain,
  parseStorageUri,
  sha256Hex,
  signingPayload,
  signingPayloadHash,
  validateEvidencePackage,
  verifyMerkleInclusion,
  type EvidencePackage,
} from "@fileonchain/utils";
import { confirmEvmAnchorOnline, type AnchorBindingTarget } from "./evm-anchor";
import { summarize, type CheckResult, type VerificationReport } from "./report";
import { verifySchemeSignature } from "./signatures";

/**
 * Verification of `legacy-evidence-v1` packages — the pre-separation
 * format (`{ "p": "fileonchain-evidence", "v": 1 }`). Kept so that
 * evidence produced before the protocol/profile split remains verifiable
 * forever; new producers should emit protocol envelopes, and
 * `migrateLegacyEvidence` converts old packages when needed.
 */

export interface VerifyLegacyOptions {
  artifactBytes?: Uint8Array;
  checkSettlements?: boolean;
  rpcUrls?: Record<string, string>;
}

export const verifyLegacyPackage = async (
  pkg: EvidencePackage,
  options: VerifyLegacyOptions = {},
): Promise<VerificationReport> => {
  const checks: CheckResult[] = [];

  const schemaErrors = validateEvidencePackage(pkg);
  if (schemaErrors.length > 0) {
    checks.push({
      name: "schema",
      group: "schema",
      status: "fail",
      detail: schemaErrors.join("; "),
    });
    return summarize(checks, false);
  }
  checks.push({
    name: "schema",
    group: "schema",
    status: "pass",
    detail: "legacy-evidence-v1 package (consider `fileonchain migrate`)",
  });

  if (options.artifactBytes) {
    const digest = sha256Hex(options.artifactBytes);
    checks.push(
      digest === pkg.artifact.sha256
        ? { name: "subject-sha256", group: "subject", status: "pass", detail: `sha256 ${digest} matches` }
        : {
            name: "subject-sha256",
            group: "subject",
            status: "fail",
            detail: `bytes hash to ${digest}, package says ${pkg.artifact.sha256}`,
          },
    );
    if (pkg.artifact.byteLength !== undefined && pkg.artifact.byteLength !== options.artifactBytes.length) {
      checks.push({
        name: "subject-size",
        group: "subject",
        status: "fail",
        detail: `bytes are ${options.artifactBytes.length} long, package says ${pkg.artifact.byteLength}`,
      });
    }
  } else {
    checks.push({
      name: "subject-sha256",
      group: "subject",
      status: "skipped",
      detail: "no artifact bytes provided — integrity not checked",
    });
  }

  if (pkg.signatures.length === 0) {
    checks.push({
      name: "artifact-signatures",
      group: "artifact-signatures",
      status: "warning",
      detail: "package is unsigned — integrity and timestamps only, no attribution",
    });
  }
  for (const [i, signature] of pkg.signatures.entries()) {
    const payload = signingPayload(pkg);
    if (signature.payloadHash !== signingPayloadHash(pkg)) {
      checks.push({
        name: `signature[${i}]`,
        group: "artifact-signatures",
        status: "fail",
        detail: "payloadHash does not match the canonical signing payload",
      });
      continue;
    }
    try {
      const { valid, detail } = await verifySchemeSignature(
        signature.signer,
        payload,
        signature.signature,
      );
      checks.push({
        name: `signature[${i}]`,
        group: "artifact-signatures",
        status: valid ? "pass" : "fail",
        detail,
      });
    } catch (error) {
      checks.push({
        name: `signature[${i}]`,
        group: "artifact-signatures",
        status: "fail",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    if (signature.signer.onBehalfOf && !signature.signer.onBehalfOf.authorization) {
      checks.push({
        name: `signature[${i}]:delegation`,
        group: "artifact-signatures",
        status: "warning",
        detail: `claims to act for ${signature.signer.onBehalfOf.id} with no verifiable delegation statement`,
      });
    }
    checks.push({
      name: `signature[${i}]:key-status`,
      group: "key-status",
      status: "unknown",
      detail: signature.signer.keyStatusUrl
        ? `check rotation/revocation at ${signature.signer.keyStatusUrl}`
        : "no key-status endpoint declared — revocation cannot be checked from the package alone",
    });
  }

  // Settlement receipts are checked before the inclusion proof is
  // reported: an inclusion proof only means something when its root is
  // actually anchored by a settlement transaction, and only the online
  // check can prove that binding.
  const settlementChecks: CheckResult[] = [];
  const anchoredValues = new Set<string>();
  const bindingTargets: AnchorBindingTarget[] = [
    { label: "the artifact sha256", value: pkg.artifact.sha256 },
    { label: "the artifact cid", value: pkg.artifact.cid },
    ...(pkg.inclusion ? [{ label: "the inclusion root", value: pkg.inclusion.root }] : []),
  ];
  for (const [i, receipt] of pkg.settlements.entries()) {
    const name = `settlement[${i}]`;
    const chain = getChain(receipt.chainId);
    if (!options.checkSettlements) {
      settlementChecks.push({
        name,
        group: "settlement-receipts",
        status: "skipped",
        detail: chain
          ? `offline — confirm at ${buildTxUrl(chain, receipt.txHash)}`
          : `offline — unknown system ${receipt.chainId}`,
      });
      continue;
    }
    if (!chain || chain.family !== "evm") {
      settlementChecks.push({
        name,
        group: "settlement-receipts",
        status: "unknown",
        detail: chain
          ? `online confirmation for ${chain.family} is not built in — confirm at ${buildTxUrl(chain, receipt.txHash)}`
          : `unknown system ${receipt.chainId}`,
      });
      continue;
    }
    const confirmation = await confirmEvmAnchorOnline({
      rpcUrl: options.rpcUrls?.[receipt.chainId] ?? chain.rpcUrl,
      txHash: receipt.txHash,
      expectedBlockNumber: receipt.blockNumber,
      targets: bindingTargets,
    });
    if (confirmation.status === "pass") {
      for (const value of confirmation.boundValues) anchoredValues.add(value);
    }
    settlementChecks.push({
      name,
      group: "settlement-receipts",
      status: confirmation.status,
      detail: confirmation.detail,
    });
  }

  if (pkg.inclusion) {
    const included = verifyMerkleInclusion(
      pkg.artifact.sha256,
      pkg.inclusion.leafIndex,
      pkg.inclusion.proof,
      pkg.inclusion.root,
    );
    if (!included) {
      checks.push({
        name: "merkle-inclusion",
        group: "inclusion-receipts",
        status: "fail",
        detail: "inclusion proof does not reach the root",
      });
    } else if (anchoredValues.has(pkg.inclusion.root)) {
      checks.push({
        name: "merkle-inclusion",
        group: "inclusion-receipts",
        status: "pass",
        detail: `leaf ${pkg.inclusion.leafIndex} proves into root ${pkg.inclusion.root} — root anchored by a confirmed settlement receipt`,
      });
    } else {
      // The proof verifies against the root the package itself supplies —
      // meaningless unless a settlement receipt anchors that root.
      checks.push({
        name: "merkle-inclusion",
        group: "inclusion-receipts",
        status: "unknown",
        detail: options.checkSettlements
          ? `proof self-consistent; root ${pkg.inclusion.root} not anchored by any confirmed settlement receipt`
          : `proof self-consistent; root ${pkg.inclusion.root} not anchored by any settlement receipt (offline mode)`,
      });
    }
  }

  for (const [i, receipt] of pkg.storage.entries()) {
    const name = `storage[${i}]`;
    if (receipt.mode === "evidence-only") {
      checks.push({ name, group: "storage-receipts", status: "pass", detail: "evidence-only: no bytes stored" });
    } else if (receipt.mode === "onchain-storage") {
      const parsed = receipt.uri ? parseStorageUri(receipt.uri) : null;
      checks.push(
        parsed
          ? {
              name,
              group: "storage-receipts",
              status: "pass",
              detail: `bytes on ${parsed.chainId}; reconstruction requires that system's history`,
            }
          : { name, group: "storage-receipts", status: "fail", detail: "onchain-storage receipt has no valid fileonchain:// URI" },
      );
    } else {
      checks.push({
        name,
        group: "storage-receipts",
        status: receipt.uri ? "unknown" : "fail",
        detail: receipt.uri
          ? `external copy at ${receipt.uri} — availability depends on the provider`
          : "external-storage receipt has no URI",
      });
    }
  }

  checks.push(...settlementChecks);

  // Legacy packages predate envelope digests: receipts are not tamper-bound.
  checks.push({
    name: "envelope-digest",
    group: "envelope",
    status: "warning",
    detail: "legacy format has no envelope digest — receipts are not cryptographically bound to the package; migrate to bind them",
  });

  return summarize(checks, false);
};

export { parseEvidencePackage as parseLegacyEvidencePackage } from "@fileonchain/utils";
