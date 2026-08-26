import {
  registerAdapter,
  LEGACY_INCLUSION_ADAPTER_ID,
  LEGACY_SETTLEMENT_ADAPTER_ID,
  LEGACY_STORAGE_ADAPTER_ID,
  type AdapterCheckResult,
  type EvidenceEnvelope,
  type Receipt,
  type ReceiptAdapter,
} from "@fileonchain/protocol";
import {
  buildTxUrl,
  getChain,
  parseStorageUri,
  verifyMerkleInclusion as verifyLegacyMerkleInclusion,
} from "@fileonchain/utils";
import { confirmEvmAnchorOnline, type AnchorBindingTarget } from "./evm-anchor";

/**
 * Built-in receipt adapters for the reference verifier. Each adapter owns
 * its payload format, offline checks, online checks, and finality notes —
 * the protocol core stays system-agnostic. Receipts whose adapter is not
 * registered are reported *unknown*, never failed.
 */

interface AnchorSettlementPayload {
  chainId?: string;
  txHash?: string;
  blockNumber?: number;
  blockHash?: string;
  timestamp?: string;
  payload?: string;
}

/** Resolve a chain-registry entry from a receipt's system / payload chainId. */
const chainFor = (receipt: Receipt) => {
  const payload = receipt.payload as AnchorSettlementPayload;
  if (payload.chainId) return getChain(payload.chainId);
  if (receipt.system?.startsWith("eip155:")) {
    return getChain(`evm:${receipt.system.slice("eip155:".length)}`);
  }
  return receipt.system ? getChain(receipt.system) : undefined;
};

const offlineSettlementCheck = (receipt: Receipt): AdapterCheckResult => {
  const payload = receipt.payload as AnchorSettlementPayload;
  if (typeof payload.txHash !== "string" || payload.txHash.length === 0) {
    return { status: "fail", detail: "settlement payload has no txHash" };
  }
  const chain = chainFor(receipt);
  // Honest limit: offline, a txHash is just a claimed pointer — nothing
  // here proves the transaction exists or references this evidence.
  return {
    status: "unknown",
    detail: chain
      ? `structure only — on-chain binding not verified offline; confirm at ${buildTxUrl(chain, payload.txHash)}`
      : `structure only on unknown system ${receipt.system ?? "?"} — on-chain binding not verified offline`,
  };
};

/**
 * What the on-chain anchor payload must reference to bind the settlement
 * to this evidence: the subject's sha256 or cid, or an inclusion
 * receipt's Merkle root (manifest-batched settlements anchor the root,
 * not each subject).
 */
const settlementBindingTargets = (envelope: EvidenceEnvelope): AnchorBindingTarget[] => {
  const targets: AnchorBindingTarget[] = [];
  const sha256 = envelope.subject.digests?.sha256;
  if (sha256) targets.push({ label: "the subject sha256", value: sha256 });
  if (envelope.subject.cid) targets.push({ label: "the subject cid", value: envelope.subject.cid });
  for (const receipt of envelope.receipts.inclusion) {
    const root = (receipt.payload as { root?: unknown }).root;
    if (typeof root === "string") targets.push({ label: "an inclusion receipt root", value: root });
  }
  return targets;
};

const onlineSettlementCheck = async (
  receipt: Receipt,
  envelope: EvidenceEnvelope,
  endpoints?: Record<string, string>,
): Promise<AdapterCheckResult> => {
  const payload = receipt.payload as AnchorSettlementPayload;
  const chain = chainFor(receipt);
  if (!chain) {
    return { status: "unknown", detail: `no known endpoint for system ${receipt.system ?? "?"}` };
  }
  if (chain.family !== "evm") {
    // Never a bare `pass` here: without decoding the transaction's actual
    // content there is no binding to this evidence.
    return {
      status: "unknown",
      detail: `online confirmation for ${chain.family} is not built into the reference verifier — confirm at ${buildTxUrl(chain, payload.txHash ?? "")}`,
    };
  }
  const rpcUrl = endpoints?.[receipt.system ?? ""] ?? endpoints?.[chain.id] ?? chain.rpcUrl;
  return confirmEvmAnchorOnline({
    rpcUrl,
    txHash: payload.txHash ?? "",
    expectedBlockNumber: payload.blockNumber,
    targets: settlementBindingTargets(envelope),
  });
};

/** EVM anchor settlement receipts (new format). */
export const evmAnchorAdapter: ReceiptAdapter = {
  id: "fileonchain-evm-anchor/v1",
  type: "settlement",
  checkOffline: (receipt) => offlineSettlementCheck(receipt),
  checkOnline: (receipt, envelope, options) =>
    onlineSettlementCheck(receipt, envelope, options?.endpoints),
};

/** Anchor settlement receipts on non-EVM systems (same payload shape). */
export const anchorAdapter: ReceiptAdapter = {
  id: "fileonchain-anchor/v1",
  type: "settlement",
  checkOffline: (receipt) => offlineSettlementCheck(receipt),
  checkOnline: (receipt, envelope, options) =>
    onlineSettlementCheck(receipt, envelope, options?.endpoints),
};

/** Legacy settlement receipts wrapped by the migration tool. */
export const legacySettlementAdapter: ReceiptAdapter = {
  id: LEGACY_SETTLEMENT_ADAPTER_ID,
  type: "settlement",
  checkOffline: (receipt) => offlineSettlementCheck(receipt),
  checkOnline: (receipt, envelope, options) =>
    onlineSettlementCheck(receipt, envelope, options?.endpoints),
};

/**
 * Migrated legacy inclusion proofs — the pre-separation Merkle scheme
 * (no leaf/internal domain separation, odd-node self-pairing). Kept only
 * so migrated packages stay checkable; new proofs use the domain-
 * separated `fileonchain-merkle/v1`.
 */
export const legacyMerkleAdapter: ReceiptAdapter = {
  id: LEGACY_INCLUSION_ADAPTER_ID,
  type: "inclusion",
  checkOffline(receipt, envelope): AdapterCheckResult {
    const payload = receipt.payload as {
      root?: string;
      leafIndex?: number;
      proof?: string[];
      leafDigest?: string;
    };
    const leaf = payload.leafDigest ?? envelope.subject.digests?.sha256;
    if (!leaf) return { status: "fail", detail: "no leaf digest (payload or subject sha256)" };
    if (
      typeof payload.root !== "string" ||
      !Number.isInteger(payload.leafIndex) ||
      !Array.isArray(payload.proof)
    ) {
      return { status: "fail", detail: "payload needs root, leafIndex, proof[]" };
    }
    const included = verifyLegacyMerkleInclusion(
      leaf,
      payload.leafIndex as number,
      payload.proof,
      payload.root,
    );
    return included
      ? {
          status: "pass",
          detail: `legacy-scheme proof: leaf ${payload.leafIndex} proves into root ${payload.root}`,
        }
      : { status: "fail", detail: "inclusion proof does not reach the root" };
  },
};

interface LegacyStoragePayload {
  mode?: "evidence-only" | "onchain-storage" | "external-storage";
  uri?: string;
}

const storageOfflineCheck = (receipt: Receipt): AdapterCheckResult => {
  const payload = receipt.payload as LegacyStoragePayload;
  if (payload.mode === "evidence-only") {
    return { status: "pass", detail: "evidence-only: no bytes stored, nothing to locate" };
  }
  if (payload.mode === "onchain-storage") {
    const parsed = payload.uri ? parseStorageUri(payload.uri) : null;
    return parsed
      ? {
          status: "pass",
          detail: `bytes on ${parsed.chainId}; reconstruction requires that system's history to be available`,
        }
      : { status: "fail", detail: "onchain-storage receipt has no valid fileonchain:// URI" };
  }
  if (payload.mode === "external-storage") {
    return payload.uri
      ? {
          status: "unknown",
          detail: `external copy at ${payload.uri} — availability depends on the provider; integrity stays hash-bound`,
        }
      : { status: "fail", detail: "external-storage receipt has no URI" };
  }
  return { status: "fail", detail: "storage payload has no recognized mode" };
};

/** Storage receipts (legacy modes; also the current reference format). */
export const legacyStorageAdapter: ReceiptAdapter = {
  id: LEGACY_STORAGE_ADAPTER_ID,
  type: "storage",
  checkOffline: storageOfflineCheck,
};

/** Same payload semantics under the current adapter id. */
export const storageAdapter: ReceiptAdapter = {
  id: "fileonchain-storage/v1",
  type: "storage",
  checkOffline: storageOfflineCheck,
};

registerAdapter(evmAnchorAdapter);
registerAdapter(anchorAdapter);
registerAdapter(legacySettlementAdapter);
registerAdapter(legacyMerkleAdapter);
registerAdapter(legacyStorageAdapter);
registerAdapter(storageAdapter);
