import "server-only";
import {
  fileRegistryAbi,
  getChain,
  parseAnchorPayload,
  type AnchorPayload,
  type ChainId,
} from "@fileonchain/sdk";
import { RPC_TRANSPORT_OPTS } from "@/lib/scan-window";
import type {
  ParsedInstruction,
  PartiallyDecodedInstruction,
} from "@solana/web3.js";

/**
 * Cross-family tx→payload RPC fetch layer for explorer detail pages.
 *
 * The pure extractors in `lib/indexer/payload-extractors.ts` are final;
 * this module is the family-aware RPC layer that fetches a confirmed
 * transaction by hash and runs it through the matching extractor.
 *
 * Per-family implementation status:
 * - EVM:       real (viem getTransactionReceipt + parseEventLogs).
 * - Solana:    real (@solana/web3.js getTransaction + SPL Memo decode).
 * - Substrate: deferred — resolving tx-hash → block requires a Subscan
 *              API key (the public Subscan endpoint rejects unauthenticated
 *              requests with 403) or an internal substrate_block_index
 *              table. Callers get an explicit unsupported status so the
 *              explorer falls back to the indexed DB hit.
 * - Others (Aptos, Sui, Cosmos, NEAR, TRON, Cardano, TON, Hedera,
 *   Starknet): throw a clear "not implemented" — the explorer surfaces
 *   this so the implementer knows where to add the family.
 *
 * RPC failures resolve to `{ supported: false, reason: "rpc-error" }` —
 * the indexer pattern of "fail open, do not fabricate" applies.
 */

export interface FetchedTx {
  chainId: ChainId;
  family: import("@fileonchain/sdk").ChainFamily;
  txHash: string;
  status: "confirmed" | "failed";
  blockHash: string;
  blockNumber: number;
  timestamp: number;
  submitter: string | null;
  anchors: AnchorPayload[];
}

export type FetchTxResult =
  | { supported: true; tx: FetchedTx }
  | { supported: false; reason: string };

const EVM_TX_HASH = /^0x[0-9a-fA-F]{64}$/;

const fetchEvmTx = async (
  chainId: ChainId,
  txHash: string,
): Promise<FetchedTx | null> => {
  const chain = getChain(chainId);
  if (!chain || chain.family !== "evm") return null;

  const { createPublicClient, http, parseEventLogs, TransactionReceiptNotFoundError } =
    await import("viem");
  const { toViemChain } = await import("@fileonchain/sdk/evm");
  const client = createPublicClient({
    chain: toViemChain(chain),
    transport: http(chain.rpcUrl, RPC_TRANSPORT_OPTS),
  });

  // Public RPCs are load-balanced and individual backends can miss a tx
  // the chain definitely has (observed on Sepolia's publicnode pool) —
  // a couple of short retries turn that persistent-looking "not found"
  // into a hit. Real transport failures bubble up to the caller's
  // rpc-error mapping instead of masquerading as tx-not-found.
  let receipt = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
      break;
    } catch (error) {
      if (!(error instanceof TransactionReceiptNotFoundError)) throw error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (!receipt) return null;

  // Filter to logs emitted by the deployed FileRegistry. The events
  // carry the payload in `uri` (string), so receipt-log decoding is
  // sufficient — we don't need to walk calldata.
  const registryLogs = receipt.logs.filter(
    (log) =>
      chain.registryContract &&
      log.address.toLowerCase() === chain.registryContract.toLowerCase(),
  );

  const uris: string[] = [];
  for (const eventName of ["CIDAnchored", "ChunkAnchored"] as const) {
    const decoded = parseEventLogs({
      abi: fileRegistryAbi,
      eventName,
      logs: registryLogs,
    });
    for (const log of decoded) {
      if (typeof log.args.uri === "string") uris.push(log.args.uri);
    }
  }

  const block = await client
    .getBlock({ blockNumber: receipt.blockNumber, includeTransactions: false })
    .catch(() => null);

  return {
    chainId,
    family: "evm",
    txHash,
    status: receipt.status === "success" ? "confirmed" : "failed",
    blockHash: receipt.blockHash,
    blockNumber: Number(receipt.blockNumber),
    timestamp: block ? Number(block.timestamp) : Math.floor(Date.now() / 1000),
    submitter: receipt.from,
    anchors: uris
      .map((u) => parseAnchorPayload(u))
      .filter((p): p is AnchorPayload => p !== null),
  };
};

const fetchSolanaTx = async (
  chainId: ChainId,
  txHash: string,
): Promise<FetchedTx | null> => {
  const chain = getChain(chainId);
  if (!chain || chain.family !== "solana") return null;
  const { Connection } = await import("@solana/web3.js");

  const connection = new Connection(chain.rpcUrl, "confirmed");
  // The PARSED form, for two reasons: raw getTransaction THROWS on any
  // versioned (v0) transaction unless maxSupportedTransactionVersion is
  // set (the old swallow-all catch rendered that as a bogus
  // "tx-not-found"), and raw compiled-instruction data is base58 — the
  // old path decoded it as base64, so memos never parsed. Parsed
  // transactions hand SPL Memo instructions back as their decoded text
  // for legacy and v0 alike.
  const tx = await connection
    .getParsedTransaction(txHash, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    })
    .catch(() => null);
  if (!tx) return null;

  const memos: string[] = [];
  const collect = (
    ixs: ReadonlyArray<ParsedInstruction | PartiallyDecodedInstruction>,
  ): void => {
    for (const ix of ixs) {
      if ("parsed" in ix && ix.program === "spl-memo" && typeof ix.parsed === "string") {
        memos.push(ix.parsed);
      }
    }
  };
  collect(tx.transaction.message.instructions);
  for (const inner of tx.meta?.innerInstructions ?? []) {
    collect(inner.instructions);
  }

  const accounts = tx.transaction.message.accountKeys;
  const submitter =
    (accounts.find((a) => a.signer) ?? accounts[0])?.pubkey.toBase58() ?? null;

  return {
    chainId,
    family: "solana",
    txHash,
    status: tx.meta?.err ? "failed" : "confirmed",
    blockHash: tx.transaction.message.recentBlockhash,
    blockNumber: tx.slot,
    timestamp: tx.blockTime ?? Math.floor(Date.now() / 1000),
    submitter,
    anchors: memos
      .map((m) => parseAnchorPayload(m))
      .filter((p): p is AnchorPayload => p !== null),
  };
};

/**
 * Fetch a confirmed transaction by hash and decode its FileOnChain
 * anchor payload(s). Returns a discriminated union so callers can
 * distinguish "RPC failed" from "this family isn't wired yet".
 */
export const fetchTxPayloads = async (
  chainId: ChainId,
  txHash: string,
): Promise<FetchTxResult> => {
  const chain = getChain(chainId);
  if (!chain) {
    return { supported: false, reason: "unknown-chain" };
  }

  try {
    if (chain.family === "evm") {
      if (!EVM_TX_HASH.test(txHash)) {
        return { supported: false, reason: "invalid-tx-hash" };
      }
      const tx = await fetchEvmTx(chainId, txHash);
      if (!tx) return { supported: false, reason: "tx-not-found" };
      return { supported: true, tx };
    }
    if (chain.family === "solana") {
      const tx = await fetchSolanaTx(chainId, txHash);
      if (!tx) return { supported: false, reason: "tx-not-found" };
      return { supported: true, tx };
    }
    if (chain.family === "substrate") {
      return {
        supported: false,
        reason:
          "substrate tx-hash lookup requires SUBSCAN_API_KEY or an internal block index",
      };
    }
    return {
      supported: false,
      reason: `family ${chain.family} tx fetcher not implemented yet`,
    };
  } catch (error) {
    return {
      supported: false,
      reason:
        error instanceof Error
          ? `rpc-error: ${error.message}`
          : "rpc-error",
    };
  }
};
