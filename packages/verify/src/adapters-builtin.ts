import { createPublicClient, http } from "viem";
import {
  registerAdapter,
  LEGACY_SETTLEMENT_ADAPTER_ID,
  LEGACY_STORAGE_ADAPTER_ID,
  type AdapterCheckResult,
  type Receipt,
  type ReceiptAdapter,
} from "@fileonchain/protocol";
import { buildTxUrl, getChain, parseStorageUri } from "@fileonchain/utils";

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
  return {
    status: "pass",
    detail: chain
      ? `receipt structurally valid — confirm at ${buildTxUrl(chain, payload.txHash)}`
      : `receipt structurally valid on unknown system ${receipt.system ?? "?"}`,
  };
};

const onlineSettlementCheck = async (
  receipt: Receipt,
  endpoints?: Record<string, string>,
): Promise<AdapterCheckResult> => {
  const payload = receipt.payload as AnchorSettlementPayload;
  const chain = chainFor(receipt);
  if (!chain) {
    return { status: "unknown", detail: `no known endpoint for system ${receipt.system ?? "?"}` };
  }
  if (chain.family !== "evm") {
    return {
      status: "unknown",
      detail: `online confirmation for ${chain.family} is not built into the reference verifier — confirm at ${buildTxUrl(chain, payload.txHash ?? "")}`,
    };
  }
  try {
    const rpcUrl =
      endpoints?.[receipt.system ?? ""] ?? endpoints?.[chain.id] ?? chain.rpcUrl;
    const client = createPublicClient({ transport: http(rpcUrl) });
    const txReceipt = await client.getTransactionReceipt({
      hash: payload.txHash as `0x${string}`,
    });
    if (txReceipt.status !== "success") {
      return { status: "fail", detail: "transaction reverted" };
    }
    if (
      payload.blockNumber !== undefined &&
      Number(txReceipt.blockNumber) !== payload.blockNumber
    ) {
      return {
        status: "fail",
        detail: `block mismatch: receipt says ${payload.blockNumber}, chain says ${txReceipt.blockNumber}`,
      };
    }
    // Finality note: a passing check confirms inclusion, not finality —
    // relying parties should apply the chain's own finality depth.
    return { status: "pass", detail: `confirmed in block ${txReceipt.blockNumber} (inclusion, not finality)` };
  } catch (error) {
    return {
      status: "unknown",
      detail: `online confirmation unavailable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

/** EVM anchor settlement receipts (new format). */
export const evmAnchorAdapter: ReceiptAdapter = {
  id: "fileonchain-evm-anchor/v1",
  type: "settlement",
  checkOffline: (receipt) => offlineSettlementCheck(receipt),
  checkOnline: (receipt, _envelope, options) =>
    onlineSettlementCheck(receipt, options?.endpoints),
};

/** Anchor settlement receipts on non-EVM systems (same payload shape). */
export const anchorAdapter: ReceiptAdapter = {
  id: "fileonchain-anchor/v1",
  type: "settlement",
  checkOffline: (receipt) => offlineSettlementCheck(receipt),
  checkOnline: (receipt, _envelope, options) =>
    onlineSettlementCheck(receipt, options?.endpoints),
};

/** Legacy settlement receipts wrapped by the migration tool. */
export const legacySettlementAdapter: ReceiptAdapter = {
  id: LEGACY_SETTLEMENT_ADAPTER_ID,
  type: "settlement",
  checkOffline: (receipt) => offlineSettlementCheck(receipt),
  checkOnline: (receipt, _envelope, options) =>
    onlineSettlementCheck(receipt, options?.endpoints),
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
registerAdapter(legacyStorageAdapter);
registerAdapter(storageAdapter);
