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

export const isCachePaymentProvisioned = (
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

/** Per-chain live pricing row from the deployed `CachePayments` contract.
 *  USDC amounts are 6-decimal (`priceSingle/priceFolder/pricePermanent`).
 *  Returned as decimal strings because JSON cannot serialize `bigint`;
 *  the client formats with `formatUnits(value, 6)`. */
export interface CachePricingRow {
  /** USDC 6-decimal wei — `formatUnits(single, 6)` for the marketing string. */
  single: string;
  folder: string;
  permanent: string;
  /** Treasury address the deployed contract forwards to — surfaced on the
   *  donations page; equals `treasury()` on the same contract. */
  treasury: `0x${string}`;
}

/** `Record<ChainId, CachePricingRow>` with chains that failed to read
 *  absent (no fabricated zero rows). */
export type CachePricingMap = Partial<Record<string, CachePricingRow>>;

/** Read live `CachePayments` prices + treasury on every provisioned EVM
 *  chain. Each chain is independent — one RPC failure doesn't hide prices
 *  from the others. The pricing table on `/cache` hydrates from this and
 *  falls back to the marketing values (`CACHE_PRICING.priceUsdc`) when
 *  the active chain is unprovisioned or absent from the result.
 *
 *  `treasury` is the canonical forward-to address for the same contract;
 *  the donations page also reads it here instead of issuing a parallel
 *  RPC against `DonationEscrow` (which forwards to the same address). */
export const getCachePricing = async (): Promise<CachePricingMap> => {
  const chains = CHAINS.filter(isCachePaymentProvisioned);
  const results = await Promise.all(
    chains.map(async (chain): Promise<[string, CachePricingRow] | null> => {
      try {
        const { createPublicClient, http } = await import("viem");
        const { toViemChain } = await import("@fileonchain/sdk/evm");
        const client = createPublicClient({
          chain: toViemChain(chain),
          transport: http(chain.rpcUrl, RPC_TRANSPORT_OPTS),
        });
        const [single, folder, permanent, treasury] = await Promise.all([
          client.readContract({
            address: chain.cacheContract,
            abi: cachePaymentsAbi,
            functionName: "priceSingle",
          }),
          client.readContract({
            address: chain.cacheContract,
            abi: cachePaymentsAbi,
            functionName: "priceFolder",
          }),
          client.readContract({
            address: chain.cacheContract,
            abi: cachePaymentsAbi,
            functionName: "pricePermanent",
          }),
          client.readContract({
            address: chain.cacheContract,
            abi: cachePaymentsAbi,
            functionName: "treasury",
          }),
        ]);
        return [
          chain.id,
          {
            single: (single as bigint).toString(),
            folder: (folder as bigint).toString(),
            permanent: (permanent as bigint).toString(),
            treasury: treasury as `0x${string}`,
          },
        ];
      } catch {
        return null;
      }
    }),
  );
  const map: CachePricingMap = {};
  for (const entry of results) {
    if (entry) map[entry[0]] = entry[1];
  }
  return map;
};
