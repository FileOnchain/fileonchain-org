import { createPublicKey, verify as nodeVerify } from "node:crypto";
import { createPublicClient, http, verifyMessage } from "viem";
import {
  buildTxUrl,
  getChain,
  parseEvidencePackage,
  parseStorageUri,
  sha256Hex,
  signingPayload,
  signingPayloadHash,
  validateEvidencePackage,
  verifyMerkleInclusion,
  hexToBytes,
  type EvidencePackage,
  type EvidenceSignature,
  type SettlementReceipt,
} from "@fileonchain/utils";

/**
 * Deterministic local verification of FileOnChain evidence packages.
 *
 * Everything here runs without calling any FileOnChain service. Offline
 * checks (schema, canonical encoding, artifact hash, signatures, Merkle
 * inclusion, storage-receipt structure) are fully deterministic; the
 * optional online pass confirms settlement receipts against public RPC
 * endpoints the verifier chooses.
 *
 * What verification means — and what it does not: a passing report shows
 * that these bytes hash to the packaged digests, that the listed keys
 * signed the package's signing payload, that the artifact is included in
 * the anchored Merkle root, and that the settlement transactions exist on
 * their chains. It does NOT show that the artifact is true, legally valid,
 * or factually accurate, nor who controls a key beyond the key itself.
 */

export type CheckStatus = "pass" | "fail" | "skipped" | "unknown";

export interface CheckResult {
  /** Stable check identifier, e.g. "schema", "artifact-sha256". */
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface VerificationReport {
  /** True when no check failed (skipped/unknown checks do not fail a report). */
  ok: boolean;
  checks: CheckResult[];
}

export interface VerifyOptions {
  /** Raw artifact bytes; enables the content-integrity checks. */
  artifactBytes?: Uint8Array;
  /**
   * Confirm settlement receipts against public RPC endpoints (EVM chains
   * in v1; other families report "unknown" with an explorer link). Off by
   * default — verification never needs the network unless asked.
   */
  checkSettlements?: boolean;
  /** Override RPC URLs per chain id; defaults to the registry's entries. */
  rpcUrls?: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Signature schemes                                                   */
/* ------------------------------------------------------------------ */

/** SPKI DER prefix for a raw ed25519 public key (RFC 8410). */
const ED25519_SPKI_PREFIX = hexToBytes("302a300506032b6570032100");

const verifyEd25519 = (message: string, signatureHex: string, publicKeyHex: string): boolean => {
  const raw = hexToBytes(publicKeyHex);
  if (raw.length !== 32) return false;
  const spki = new Uint8Array(ED25519_SPKI_PREFIX.length + 32);
  spki.set(ED25519_SPKI_PREFIX);
  spki.set(raw, ED25519_SPKI_PREFIX.length);
  const key = createPublicKey({ key: Buffer.from(spki), format: "der", type: "spki" });
  return nodeVerify(null, Buffer.from(message, "utf8"), key, Buffer.from(hexToBytes(signatureHex)));
};

const verifySignature = async (
  pkg: EvidencePackage,
  signature: EvidenceSignature,
): Promise<{ valid: boolean; detail: string }> => {
  const payload = signingPayload(pkg);
  const expectedHash = signingPayloadHash(pkg);
  if (signature.payloadHash !== expectedHash) {
    return {
      valid: false,
      detail: `payloadHash ${signature.payloadHash} does not match the canonical signing payload (${expectedHash})`,
    };
  }
  const { scheme, publicKey } = signature.signer;
  if (scheme === "eip191") {
    const valid = await verifyMessage({
      address: publicKey as `0x${string}`,
      message: payload,
      signature: signature.signature as `0x${string}`,
    });
    return { valid, detail: valid ? `EIP-191 signature by ${publicKey}` : `EIP-191 signature does not recover to ${publicKey}` };
  }
  if (scheme === "ed25519") {
    const valid = verifyEd25519(payload, signature.signature, publicKey);
    return { valid, detail: valid ? `ed25519 signature by ${publicKey}` : `ed25519 signature invalid for ${publicKey}` };
  }
  return { valid: false, detail: `unknown scheme "${scheme as string}"` };
};

/* ------------------------------------------------------------------ */
/* Settlement receipts (online, optional)                              */
/* ------------------------------------------------------------------ */

const checkEvmSettlement = async (
  receipt: SettlementReceipt,
  rpcUrl: string,
): Promise<CheckResult> => {
  const name = `settlement:${receipt.chainId}:${receipt.txHash}`;
  try {
    const client = createPublicClient({ transport: http(rpcUrl) });
    const txReceipt = await client.getTransactionReceipt({
      hash: receipt.txHash as `0x${string}`,
    });
    if (txReceipt.status !== "success") {
      return { name, status: "fail", detail: "transaction reverted" };
    }
    if (
      receipt.blockNumber !== undefined &&
      Number(txReceipt.blockNumber) !== receipt.blockNumber
    ) {
      return {
        name,
        status: "fail",
        detail: `block mismatch: receipt says ${receipt.blockNumber}, chain says ${txReceipt.blockNumber}`,
      };
    }
    return {
      name,
      status: "pass",
      detail: `confirmed in block ${txReceipt.blockNumber}`,
    };
  } catch (error) {
    return {
      name,
      status: "unknown",
      detail: `could not confirm via RPC: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

/* ------------------------------------------------------------------ */
/* The verifier                                                        */
/* ------------------------------------------------------------------ */

export const verifyEvidencePackage = async (
  pkg: EvidencePackage,
  options: VerifyOptions = {},
): Promise<VerificationReport> => {
  const checks: CheckResult[] = [];

  // 1. Schema + canonical encoding.
  const schemaErrors = validateEvidencePackage(pkg);
  checks.push(
    schemaErrors.length === 0
      ? { name: "schema", status: "pass", detail: `evidence package v${pkg.v}` }
      : { name: "schema", status: "fail", detail: schemaErrors.join("; ") },
  );
  if (schemaErrors.length > 0) return { ok: false, checks };

  // 2. Artifact content integrity.
  if (options.artifactBytes) {
    const digest = sha256Hex(options.artifactBytes);
    checks.push(
      digest === pkg.artifact.sha256
        ? { name: "artifact-sha256", status: "pass", detail: `sha256 ${digest} matches` }
        : {
            name: "artifact-sha256",
            status: "fail",
            detail: `bytes hash to ${digest}, package says ${pkg.artifact.sha256}`,
          },
    );
    if (
      pkg.artifact.byteLength !== undefined &&
      pkg.artifact.byteLength !== options.artifactBytes.length
    ) {
      checks.push({
        name: "artifact-length",
        status: "fail",
        detail: `bytes are ${options.artifactBytes.length} long, package says ${pkg.artifact.byteLength}`,
      });
    }
  } else {
    checks.push({
      name: "artifact-sha256",
      status: "skipped",
      detail: "no artifact bytes provided",
    });
  }

  // 3. Signatures + signer identity information.
  if (pkg.signatures.length === 0) {
    checks.push({
      name: "signatures",
      status: "unknown",
      detail: "package is unsigned — integrity and timestamps only, no attribution",
    });
  }
  for (const [i, signature] of pkg.signatures.entries()) {
    try {
      const { valid, detail } = await verifySignature(pkg, signature);
      checks.push({ name: `signature[${i}]`, status: valid ? "pass" : "fail", detail });
    } catch (error) {
      checks.push({
        name: `signature[${i}]`,
        status: "fail",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    checks.push({
      name: `signature[${i}]:key-status`,
      status: "unknown",
      detail: signature.signer.keyStatusUrl
        ? `check revocation/rotation at ${signature.signer.keyStatusUrl}`
        : "no key-status endpoint declared — revocation cannot be checked from the package alone",
    });
    if (signature.signer.onBehalfOf && !signature.signer.onBehalfOf.authorization) {
      checks.push({
        name: `signature[${i}]:delegation`,
        status: "unknown",
        detail: `claims to act for ${signature.signer.onBehalfOf.id} but carries no verifiable delegation statement`,
      });
    }
  }

  // 4. Merkle inclusion.
  if (pkg.inclusion) {
    const included = verifyMerkleInclusion(
      pkg.artifact.sha256,
      pkg.inclusion.leafIndex,
      pkg.inclusion.proof,
      pkg.inclusion.root,
    );
    checks.push(
      included
        ? {
            name: "merkle-inclusion",
            status: "pass",
            detail: `leaf ${pkg.inclusion.leafIndex} proves into root ${pkg.inclusion.root}`,
          }
        : { name: "merkle-inclusion", status: "fail", detail: "inclusion proof does not reach the root" },
    );
  }

  // 5. Storage receipts (structural).
  for (const [i, receipt] of pkg.storage.entries()) {
    const name = `storage[${i}]`;
    if (receipt.mode === "evidence-only") {
      checks.push({ name, status: "pass", detail: "evidence-only: no bytes stored, nothing to locate" });
    } else if (receipt.mode === "onchain-storage") {
      const parsed = receipt.uri ? parseStorageUri(receipt.uri) : null;
      checks.push(
        parsed
          ? {
              name,
              status: "pass",
              detail: `bytes on ${parsed.chainId}; rebuild from the chunk trail requires that chain's history to be available`,
            }
          : { name, status: "fail", detail: "onchain-storage receipt has no valid fileonchain:// URI" },
      );
    } else {
      checks.push({
        name,
        status: receipt.uri ? "unknown" : "fail",
        detail: receipt.uri
          ? `external copy at ${receipt.uri} — availability depends on the provider`
          : "external-storage receipt has no URI",
      });
    }
  }

  // 6. Settlement receipts.
  for (const [i, receipt] of pkg.settlements.entries()) {
    const chain = getChain(receipt.chainId);
    if (!options.checkSettlements) {
      checks.push({
        name: `settlement[${i}]`,
        status: "skipped",
        detail: chain
          ? `offline — confirm at ${buildTxUrl(chain, receipt.txHash)}`
          : `offline — unknown chain ${receipt.chainId}`,
      });
      continue;
    }
    if (!chain) {
      checks.push({ name: `settlement[${i}]`, status: "unknown", detail: `unknown chain ${receipt.chainId}` });
      continue;
    }
    if (chain.family === "evm") {
      checks.push(
        await checkEvmSettlement(receipt, options.rpcUrls?.[receipt.chainId] ?? chain.rpcUrl),
      );
    } else {
      checks.push({
        name: `settlement[${i}]`,
        status: "unknown",
        detail: `online confirmation for ${chain.family} is not built into the v1 verifier — confirm at ${buildTxUrl(chain, receipt.txHash)}`,
      });
    }
  }

  return { ok: checks.every((c) => c.status !== "fail"), checks };
};

/** Parse + verify a serialized package in one step. */
export const verifyEvidenceJson = async (
  raw: string,
  options: VerifyOptions = {},
): Promise<VerificationReport> => {
  const pkg = parseEvidencePackage(raw);
  if (!pkg) {
    return {
      ok: false,
      checks: [{ name: "schema", status: "fail", detail: "not a valid fileonchain-evidence v1 document" }],
    };
  }
  return verifyEvidencePackage(pkg, options);
};

export type { EvidencePackage } from "@fileonchain/utils";
