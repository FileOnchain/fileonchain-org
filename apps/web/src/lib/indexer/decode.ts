import {
  parseAnchorPayload,
  type ChainId,
} from "@fileonchain/sdk";

/**
 * Pure, no-IO decode for the indexer. `scan.ts` only ever turned a viem
 * `Log<...>` into a row payload; pulling the conversion here makes it
 * trivially testable without spinning up Drizzle, viem, or a fixture
 * RPC. The decoder has no globals, no time, no randomness — it only
 * reads the log + the timestamp cache the caller provides.
 *
 * The function drops anything that isn't a real FileOnChain anchor
 * payload (a chain re-deploy by another contract, an event whose
 * `uri` failed to round-trip, a row whose block is missing from the
 * timestamp cache). The drop is silent: the indexer never surfaces
 * rows whose CID it can't recover, so storing them would just bloat
 * the explorer feed with non-FileOnChain contract noise.
 */

export interface RawEventLog {
  readonly transactionHash: `0x${string}` | null | undefined;
  readonly blockNumber: bigint | null | undefined;
  readonly logIndex: number | null | undefined;
  readonly args: {
    readonly uri?: unknown;
    readonly submitter?: unknown;
  };
}

export interface DecodedAnchorRow {
  readonly txHash: `0x${string}`;
  readonly logIndex: number;
  readonly blockNumber: number;
  readonly blockTimestamp: Date;
  readonly submitter: `0x${string}`;
  readonly cid: string;
  readonly payload: object;
}

const isHexAddress = (value: unknown): value is `0x${string}` =>
  typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);

/**
 * Walk the union of two `getLogs` results (CIDAnchored + ChunkAnchored)
 * and produce the rows ready to INSERT into `indexed_anchor_event`.
 *
 * `blockTimestamps` is the per-block timestamp cache the caller built
 * with one `getBlock` per distinct block — see `scan.ts`. The decoder
 * skips any log whose block wasn't fetched (the cache is authoritative
 * for the scan window).
 */
export const decodeAnchorRows = (
  logs: ReadonlyArray<RawEventLog>,
  blockTimestamps: ReadonlyMap<bigint, Date>,
  chainId: ChainId,
  registryContract: `0x${string}`,
): DecodedAnchorRow[] => {
  const out: DecodedAnchorRow[] = [];
  for (const log of logs) {
    const { transactionHash, blockNumber, logIndex, args } = log;
    if (transactionHash === null || transactionHash === undefined) continue;
    if (blockNumber === null || blockNumber === undefined) continue;
    if (logIndex === null || logIndex === undefined) continue;
    if (typeof args.uri !== "string") continue;
    const payload = parseAnchorPayload(args.uri);
    if (!payload) continue;
    if (!isHexAddress(args.submitter)) continue;
    const blockTimestamp = blockTimestamps.get(blockNumber);
    if (!blockTimestamp) continue;
    out.push({
      txHash: transactionHash,
      logIndex,
      blockNumber: Number(blockNumber),
      blockTimestamp,
      submitter: args.submitter.toLowerCase() as `0x${string}`,
      cid: payload.cid,
      payload,
    });
  }
  // The two callers pass `chainId` + `registryContract` for parity
  // with future family-specific extractors; today they're unused but
  // kept on the signature so the seam doesn't churn when the
  // Substrate/Solana scanners get the same treatment.
  void chainId;
  void registryContract;
  return out;
};
