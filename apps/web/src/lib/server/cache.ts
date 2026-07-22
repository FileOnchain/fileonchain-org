import "server-only";
import {
  CHAINS,
  ZERO_ADDRESS,
  cachePaymentsAbi,
  isChainActive,
  type ChainConfig,
} from "@fileonchain/sdk";
import type { CacheTier, MockCacheEntry } from "@/lib/mock/cache";
import { RPC_TRANSPORT_OPTS } from "@/lib/scan-window";

/**
 * Real `CachePayments` contract reads — fills the `useCacheStates` Zustand
 * store with the entries a user actually owns. The `useCachePayment` hook
 * (the write path) already runs `approve` + `payForCache` against this
 * same contract; this module is the matching read path so the
 * `CacheMyList` / `CacheAccessModal` surfaces stop seeding from
 * `MOCK_CACHE_ENTRIES`.
 *
 * Per chain:
 *   1. Scan `CachePaid(payer, tier, expiresAt)` events filtered to the user.
 *   2. For each match, call `getEntry(entryId)` to read the live
 *      `CacheEntry` struct (owner, expiresAt, active, allowList[]).
 *
 * The contract does NOT store `cid` / `filename` / `sizeBytes` — those
 * require an off-chain `cache_entries` table to roundtrip through
 * `payForCache`. Until that ships, the `cid` field on `MockCacheEntry`
 * carries the entryId bytes32 hex (prefixed with `0x`); the `filename`
 * field carries a synthetic label derived from the entryId. The shape is
 * stable so consumers can switch to the real values when the off-chain
 * table lands.
 *
 * Read errors resolve to an empty list — the explorer/indexer pattern is
 * "fail open, do not fabricate" (see `lib/registry/reads.ts:60-64`).
 */

type CachePaymentChain = ChainConfig & {
  cacheContract: `0x${string}`;
  usdcContract: `0x${string}`;
};

const isCachePaymentProvisioned = (
  chain: ChainConfig | undefined,
): chain is CachePaymentChain =>
  !!chain &&
  chain.family === "evm" &&
  chain.status !== "deprecated" &&
  isChainActive(chain) &&
  !!chain.cacheContract &&
  chain.cacheContract !== ZERO_ADDRESS &&
  !!chain.usdcContract &&
  chain.usdcContract !== ZERO_ADDRESS;

const TIER_INDEX_TO_LABEL: readonly CacheTier[] = ["SingleFile", "Folder", "Permanent"];

/** Build a deterministic synthetic filename from an entryId. */
const syntheticFilename = (entryId: `0x${string}`): string =>
  `cache-${entryId.slice(2, 10)}`;

const readEntriesForChain = async (
  chain: CachePaymentChain,
  userAddress: `0x${string}`,
): Promise<MockCacheEntry[]> => {
  const { createPublicClient, http, parseAbiItem } = await import("viem");
  const { toViemChain } = await import("@fileonchain/sdk/evm");
  const client = createPublicClient({
    chain: toViemChain(chain),
    transport: http(chain.rpcUrl, RPC_TRANSPORT_OPTS),
  });

  const cachePaid = parseAbiItem(
    "event CachePaid(bytes32 indexed entryId, address indexed payer, uint8 tier, uint64 expiresAt)",
  );

  // Walk back ~10k blocks. Cache is not high-throughput on Sepolia/Chronos
  // yet, so a bounded lookback is plenty for the user's own entries; if
  // the chain head is lower than the lookback window, viem clamps to the
  // deployed-block origin.
  const head = await client.getBlockNumber();
  const fromBlock = head > 10_000n ? head - 10_000n : 0n;

  let logs;
  try {
    logs = await client.getLogs({
      address: chain.cacheContract,
      event: cachePaid,
      args: { payer: userAddress },
      fromBlock,
      toBlock: head,
    });
  } catch {
    return [];
  }

  // Read the live entry struct for each match in parallel.
  const entries = await Promise.all(
    logs.map(async (log) => {
      const entryId = log.args.entryId as `0x${string}`;
      try {
        const onchain = (await client.readContract({
          address: chain.cacheContract,
          abi: cachePaymentsAbi,
          functionName: "getEntry",
          args: [entryId],
        })) as {
          owner: `0x${string}`;
          fileId: `0x${string}`;
          expiresAt: bigint;
          active: boolean;
          allowList: readonly `0x${string}`[];
        };
        if (!onchain.active) return null;
        const tierIndex = Number(log.args.tier);
        const tier = TIER_INDEX_TO_LABEL[tierIndex] ?? "SingleFile";
        const expiresAt = Number(onchain.expiresAt);
        return {
          id: entryId,
          tier,
          // The contract stores only the entryId bytes32. We surface it as
          // the `cid` slot for now; an off-chain cache_entries table will
          // replace this with the real upload CID.
          cid: `cache:${entryId}`,
          filename: syntheticFilename(entryId),
          // Size is not on chain — leave 0 until the off-chain table
          // lands. The CacheMyList UI surfaces "—" for zero-byte entries.
          sizeBytes: 0,
          expiresAt: expiresAt === 0 ? null : expiresAt,
          allowList: [...onchain.allowList],
        } satisfies MockCacheEntry;
      } catch {
        return null;
      }
    }),
  );
  return entries.filter((e): e is MockCacheEntry => e !== null);
};

/**
 * Read all cache entries owned by `userAddress` across every provisioned
 * EVM chain. Returns a flat list (one entry per chain × entry); the
 * `chainId` is not on `MockCacheEntry` today, so callers that need to
 * group by chain can derive it from the entryId's leading bytes (not
 * stable). An off-chain `cache_entries` table is the proper home for the
 * chain id.
 */
export const getUserCacheEntries = async (
  userAddress: `0x${string}`,
): Promise<MockCacheEntry[]> => {
  const chains = CHAINS.filter(isCachePaymentProvisioned);
  const results = await Promise.all(
    chains.map((chain) => readEntriesForChain(chain, userAddress)),
  );
  return results.flat();
};
