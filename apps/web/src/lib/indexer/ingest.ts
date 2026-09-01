import "server-only";
import { getChain, type ChainId } from "@fileonchain/sdk";
import { db, indexedAnchorEvents } from "@/lib/db";
import { RPC_TRANSPORT_OPTS } from "@/lib/scan-window";
import { decodeAnchorRows } from "@/lib/indexer/decode";
import { isEvmProvisioned } from "@/lib/indexer/scan";

/**
 * Targeted, on-demand indexing of a single anchor transaction — the
 * fast path that makes `/explorer/[cid]` resolve right after an upload
 * instead of waiting for the next cron scan window.
 *
 * Trust model: callers only hand us a pointer `(chainId, txHash)`.
 * Everything that lands in `indexed_anchor_event` is read back from the
 * chain itself — the receipt's logs, filtered to the registry contract
 * and decoded exactly like the cron scanner (`decodeAnchorRows`), so a
 * caller cannot forge rows. Inserts are idempotent via the unique
 * `(chain_id, tx_hash, log_index)` index; the cron scan re-observing
 * the same events later is a no-op.
 *
 * Reorg note: the cron scanner only walks finalized blocks; this path
 * deliberately indexes as soon as the receipt exists. A reorged-away tx
 * would leave a stale row — acceptable for the explorer feed (the row
 * simply points at a tx the chain no longer knows), and rare enough on
 * the provisioned chains that we prefer instant discoverability.
 *
 * v1 is EVM-only, mirroring the scanner. Non-EVM chains return
 * `skipped: "unsupported-chain"` so callers can fire-and-forget.
 */

export interface IngestTxResult {
  chainId: ChainId;
  txHash: string;
  eventsAdded: number;
  skipped?: "unsupported-chain" | "tx-not-found";
}

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export const isEvmTxHash = (value: unknown): value is `0x${string}` =>
  typeof value === "string" && TX_HASH_RE.test(value);

/** Fetch one tx receipt, decode its registry events, upsert the rows. */
export const ingestAnchorTx = async (
  chainId: ChainId,
  txHash: `0x${string}`,
): Promise<IngestTxResult> => {
  const chain = getChain(chainId);
  if (!isEvmProvisioned(chain)) {
    return { chainId, txHash, eventsAdded: 0, skipped: "unsupported-chain" };
  }

  const {
    createPublicClient,
    http,
    parseAbiItem,
    parseEventLogs,
    TransactionReceiptNotFoundError,
  } = await import("viem");
  const { toViemChain } = await import("@fileonchain/sdk/evm");
  const client = createPublicClient({
    chain: toViemChain(chain),
    transport: http(chain.rpcUrl, RPC_TRANSPORT_OPTS),
  });

  // The tx usually landed seconds ago, and public RPCs are load-balanced —
  // the node answering this request may lag the one that answered the
  // sender's receipt wait. A couple of short retries absorb that skew;
  // beyond it, the cron scan remains the safety net, so a miss is not an
  // error. Unexpected transport failures are logged, never thrown.
  let receipt;
  for (let attempt = 0; ; attempt += 1) {
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash });
      break;
    } catch (error) {
      if (!(error instanceof TransactionReceiptNotFoundError)) {
        console.warn("[indexer-ingest] receipt fetch failed", {
          chainId,
          txHash,
          error,
        });
        return { chainId, txHash, eventsAdded: 0, skipped: "tx-not-found" };
      }
      if (attempt >= 2) {
        return { chainId, txHash, eventsAdded: 0, skipped: "tx-not-found" };
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  if (receipt.status !== "success") {
    return { chainId, txHash, eventsAdded: 0, skipped: "tx-not-found" };
  }

  // Same two events the cron scanner pulls via getLogs.
  const decodedLogs = parseEventLogs({
    abi: [
      parseAbiItem(
        "event CIDAnchored(bytes32 indexed cidHash, bytes32 indexed contentHash, address indexed submitter, string uri, uint64 timestamp)",
      ),
      parseAbiItem(
        "event ChunkAnchored(bytes32 indexed cidHash, bytes32 indexed contentHash, address indexed submitter, string uri, uint64 timestamp)",
      ),
    ],
    logs: receipt.logs,
  }).filter(
    (log) => log.address.toLowerCase() === chain.registryContract.toLowerCase(),
  );
  if (decodedLogs.length === 0) {
    return { chainId, txHash, eventsAdded: 0 };
  }

  const block = await client.getBlock({
    blockNumber: receipt.blockNumber,
    includeTransactions: false,
  });
  const blockTimestamps = new Map<bigint, Date>([
    [receipt.blockNumber, new Date(Number(block.timestamp) * 1000)],
  ]);

  const decoded = decodeAnchorRows(
    decodedLogs,
    blockTimestamps,
    chain.id,
    chain.registryContract,
  );
  if (decoded.length === 0) {
    return { chainId, txHash, eventsAdded: 0 };
  }

  const inserted = await db
    .insert(indexedAnchorEvents)
    .values(
      decoded.map((d) => ({
        chainId: chain.id,
        cid: d.cid,
        registryAddress: chain.registryContract,
        txHash: d.txHash,
        logIndex: d.logIndex,
        blockNumber: d.blockNumber,
        blockTimestamp: d.blockTimestamp,
        submitter: d.submitter,
        payload: d.payload,
      })),
    )
    .onConflictDoNothing({
      target: [
        indexedAnchorEvents.chainId,
        indexedAnchorEvents.txHash,
        indexedAnchorEvents.logIndex,
      ],
    })
    .returning({ id: indexedAnchorEvents.id });

  return { chainId, txHash, eventsAdded: inserted.length };
};

/**
 * Batch wrapper — one receipt fetch per hash, failures isolated per tx.
 * Used by the ingest API route (client fire-and-forget after a
 * pay-as-you-go upload) and the hosted anchor service.
 */
export const ingestAnchorTxs = async (
  chainId: ChainId,
  txHashes: ReadonlyArray<`0x${string}`>,
): Promise<IngestTxResult[]> => {
  const settled = await Promise.allSettled(
    txHashes.map((txHash) => ingestAnchorTx(chainId, txHash)),
  );
  return settled.map((s, idx) => {
    if (s.status === "fulfilled") return s.value;
    console.error("[indexer-ingest] tx ingest failed", {
      chainId,
      txHash: txHashes[idx],
      error: s.reason,
    });
    return {
      chainId,
      txHash: txHashes[idx]!,
      eventsAdded: 0,
      skipped: "tx-not-found",
    };
  });
};
