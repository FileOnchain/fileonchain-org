import "server-only";
import { CHAINS, isChainActive, type ChainId, type ChainConfig, ZERO_ADDRESS, parseAnchorPayload } from "@fileonchain/sdk";
import { db, indexedAnchorEvents, indexerCursors } from "@/lib/db";
import { eq } from "drizzle-orm";

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

const SCAN_WINDOW = 9_999; // matches the deposit-watcher cap; safe on
                            // Sepolia (12s blocks ≈ 33h) and Chronos
                            // (2s blocks ≈ 5.5h).

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

  const head = await client.getBlockNumber();
  const toBlock = Number(head);
  const safeTo = Math.min(toBlock, fromBlock + SCAN_WINDOW);

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
    const uri = log.args.uri as string;
    const payload = parseAnchorPayload(uri);
    if (!payload) continue;
    const block = await client.getBlock({ blockNumber: log.blockNumber! });
    decoded.push({
      txHash: log.transactionHash!,
      logIndex: log.logIndex!,
      blockNumber: Number(log.blockNumber!),
      blockTimestamp: new Date(Number(block.timestamp) * 1000),
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

export interface IndexerScanReport {
  chains: ScanResult[];
  totalEventsAdded: number;
}

export const runIndexerScan = async (): Promise<IndexerScanReport> => {
  const targets = CHAINS.filter(isEvmProvisioned);
  const results: ScanResult[] = [];
  for (const chain of targets) {
    try {
      results.push(await scanEvmChain(chain));
    } catch (error) {
      console.error("[indexer-scan] chain scan failed", {
        chainId: chain.id,
        error,
      });
      // Leave the cursor at its prior value so the next tick retries
      // the same window — matches the deposit-watcher's fail-safe.
      results.push({ chainId: chain.id, fromBlock: 0, toBlock: 0, eventsAdded: 0 });
    }
  }
  const totalEventsAdded = results.reduce((acc, r) => r.eventsAdded, 0);
  return { chains: results, totalEventsAdded };
};

// Re-exported for ops scripts that need the predicate.
export { isEvmProvisioned };