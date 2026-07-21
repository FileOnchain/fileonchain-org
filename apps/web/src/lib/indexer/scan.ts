import "server-only";
import { CHAINS, isChainActive, type ChainId, type ChainConfig, ZERO_ADDRESS, parseAnchorPayload } from "@fileonchain/sdk";
import { db, indexedAnchorEvents, indexerCursors } from "@/lib/db";
import { eq } from "drizzle-orm";
import { SCAN_WINDOW_BLOCKS, CONFIRMED_TAG } from "@/lib/scan-window";

/**
 * EVM-only on-chain anchor scanner. Walks every chain whose
 * `registryContract` is provisioned and a real RPC is configured,
 * pulls the `CIDAnchored` + `ChunkAnchored` events emitted by
 * `FileRegistry`, parses the embedded anchor payload to recover the
 * real CID (the event's `cidHash` is keccak256 of the CID string, but
 * the CID itself rides inside the `uri` JSON), and upserts one row
 * per event into `indexed_anchor_event`. The cursor advances on every
 * tick — even when no deposits were confirmed — so a quiet chain
 * doesn't keep re-scanning the same window.
 *
 * v1 covers the two provisioned EVM chains (Sepolia + Auto EVM Chronos).
 * Non-EVM families keep the legacy mock until they ship mirror/Subscan
 * read helpers.
 */

const isEvmProvisioned = (
  chain: ChainConfig | undefined,
): chain is ChainConfig & { registryContract: `0x${string}` } =>
  !!chain &&
  chain.family === "evm" &&
  chain.status !== "deprecated" &&
  isChainActive(chain) &&
  !!chain.registryContract &&
  chain.registryContract !== ZERO_ADDRESS;

export interface ScanResult {
  chainId: ChainId;
  fromBlock: number;
  toBlock: number;
  eventsAdded: number;
}

/** Read a log batch + parse + upsert. Returns the count of new rows. */
const scanEvmChain = async (
  chain: ChainConfig & { registryContract: `0x${string}` },
): Promise<ScanResult> => {
  const { createPublicClient, http, parseAbiItem } = await import("viem");
  const { toViemChain } = await import("@fileonchain/sdk/evm");
  const client = createPublicClient({
    chain: toViemChain(chain),
    transport: http(chain.rpcUrl),
  });

  const [cursor] = await db
    .select({ lastScannedBlock: indexerCursors.lastScannedBlock })
    .from(indexerCursors)
    .where(eq(indexerCursors.chainId, chain.id))
    .limit(1);
  const fromBlock = cursor ? Number(cursor.lastScannedBlock) + 1 : 0;

  // Walk up to the last finalized block — `finalized` blocks are
  // reorg-impossible, so the unique `(chain, tx, log)` dedup index
  // catches the worst case (a re-scan sees the same row twice) on
  // the next tick instead of leaving a hole. viem 2.53 exposes
  // `finalized` as a `BlockTag` on `getBlock` (the cheaper
  // `getBlockNumber` always returns `latest`).
  const headBlock = await client.getBlock({
    blockTag: CONFIRMED_TAG,
    includeTransactions: false,
  });
  const toBlock = Number(headBlock.number);
  const safeTo = Math.min(toBlock, fromBlock + SCAN_WINDOW_BLOCKS);

  if (fromBlock > safeTo) {
    return { chainId: chain.id, fromBlock, toBlock: safeTo, eventsAdded: 0 };
  }

  // Both events share the same parameter shape; decode them with one
  // ABI item and route by event name.
  const anchoredItem = parseAbiItem(
    "event CIDAnchored(bytes32 indexed cidHash, bytes32 indexed contentHash, address indexed submitter, string uri, uint64 timestamp)",
  );
  const chunkItem = parseAbiItem(
    "event ChunkAnchored(bytes32 indexed cidHash, bytes32 indexed contentHash, address indexed submitter, string uri, uint64 timestamp)",
  );

  const [cidLogs, chunkLogs] = await Promise.all([
    client.getLogs({
      address: chain.registryContract,
      event: anchoredItem,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(safeTo),
    }),
    client.getLogs({
      address: chain.registryContract,
      event: chunkItem,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(safeTo),
    }),
  ]);

  // Collect the distinct blocks we need a timestamp for — one `getBlock`
  // call per block, regardless of how many events landed in it. viem's
  // `getLogs` doesn't surface block timestamps on its results, so we
  // fetch them explicitly.
  const blockNumbers = new Set<bigint>();
  for (const log of [...cidLogs, ...chunkLogs]) {
    if (log.blockNumber !== null && log.blockNumber !== undefined) {
      blockNumbers.add(log.blockNumber);
    }
  }
  const blockTimestamps = new Map<bigint, Date>();
  await Promise.all(
    Array.from(blockNumbers).map(async (blockNumber) => {
      const block = await client.getBlock({ blockNumber, includeTransactions: false });
      // Finalized-by-construction, but the cast keeps the `Date` type honest.
      blockTimestamps.set(blockNumber, new Date(Number(block.timestamp) * 1000));
    }),
  );

  // Decode + filter to events whose `uri` parses as a real FileOnChain
  // anchor payload. Anything that isn't ours (e.g. a chain re-deploy
  // by another contract) is silently dropped — we never store a row
  // we can't surface honestly.
  type Decoded = {
    txHash: `0x${string}`;
    logIndex: number;
    blockNumber: number;
    blockTimestamp: Date;
    submitter: `0x${string}`;
    cid: string;
    payload: object;
  };
  const decoded: Decoded[] = [];
  for (const log of [...cidLogs, ...chunkLogs]) {
    const uri = log.args.uri;
    if (typeof uri !== "string") continue;
    const payload = parseAnchorPayload(uri);
    if (!payload) continue;
    const blockTimestamp = blockNumber(log.blockNumber, blockTimestamps);
    if (!blockTimestamp) continue; // getLogs shouldn't emit a log without a block, but be defensive
    decoded.push({
      txHash: log.transactionHash!,
      logIndex: log.logIndex!,
      blockNumber: Number(log.blockNumber!),
      blockTimestamp,
      submitter: (log.args.submitter as string).toLowerCase() as `0x${string}`,
      cid: payload.cid,
      payload,
    });
  }

  if (decoded.length > 0) {
    await db
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
        target: [indexedAnchorEvents.chainId, indexedAnchorEvents.txHash, indexedAnchorEvents.logIndex],
      });
  }

  await db
    .insert(indexerCursors)
    .values({ chainId: chain.id, lastScannedBlock: safeTo })
    .onConflictDoUpdate({
      target: indexerCursors.chainId,
      set: { lastScannedBlock: safeTo, updatedAt: new Date() },
    });

  return { chainId: chain.id, fromBlock, toBlock: safeTo, eventsAdded: decoded.length };
};

const blockNumber = (
  raw: bigint | null | undefined,
  cache: Map<bigint, Date>,
): Date | null => {
  if (raw === null || raw === undefined) return null;
  return cache.get(raw) ?? null;
};

export interface IndexerScanReport {
  chains: ScanResult[];
  totalEventsAdded: number;
}

export const runIndexerScan = async (): Promise<IndexerScanReport> => {
  const targets = CHAINS.filter(isEvmProvisioned);
  // Chains are independent (different RPCs, different cursors) — fan
  // them out in parallel so the slowest chain dictates the tick rather
  // than the sum. A failure on one chain must not stall the others.
  const settled = await Promise.allSettled(
    targets.map((chain) => scanEvmChain(chain)),
  );
  const results: ScanResult[] = settled.map((s, idx) => {
    if (s.status === "fulfilled") return s.value;
    const chainId = targets[idx]!.id;
    console.error("[indexer-scan] chain scan failed", { chainId, error: s.reason });
    return { chainId, fromBlock: 0, toBlock: 0, eventsAdded: 0 };
  });
  const totalEventsAdded = results.reduce((acc, r) => r.eventsAdded, 0);
  return { chains: results, totalEventsAdded };
}

// Re-exported for ops scripts that need the predicate.
export { isEvmProvisioned };
