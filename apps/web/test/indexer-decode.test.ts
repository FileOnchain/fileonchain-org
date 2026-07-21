import { describe, expect, it } from "vitest";
import { decodeAnchorRows, type RawEventLog } from "@/lib/indexer/decode";
import type { ChainId } from "@fileonchain/sdk";

/** decodeAnchorRows is a side-effect-free function: it walks a
 *  flat list of viem `Log<...>` shapes, drops anything that isn't
 *  a real FileOnChain anchor payload, and emits the rows ready to
 *  INSERT into `indexed_anchor_event`. The tests below exercise the
 *  happy path + every filter that should cause a drop. */

const CHAIN: ChainId = "evm:sepolia" as ChainId;
const REGISTRY = "0x000000000000000000000000000000000000dEaD" as `0x${string}`;
const SUBMITTER = "0x0000000000000000000000000000000000000abc" as `0x${string}`;

/** A minimal FileOnChain `file` anchor payload. The SDK's
 *  `parseAnchorPayload` is the source of truth for the URI shape — see
 *  `packages/utils/src/anchor.ts`. `cid` must be a valid CIDv1 base32
 *  (`b` + 58+ chars) for `isValidCID` to let it through. */
const fileUri = (cid: string): string =>
  JSON.stringify({
    p: "fileonchain",
    v: 1,
    op: "anchor",
    cid,
    pid: "1",
  });

const VALID_CID = "bafybeigdyrzt5sfp7udm7hu76ys7tep27uxxi5y5q3kxymtsv2t7xspbio" as string;

const makeLog = (overrides: Partial<RawEventLog> = {}): RawEventLog => ({
  transactionHash: "0x" + "11".repeat(32) as `0x${string}`,
  blockNumber: 1_000n,
  logIndex: 0,
  args: {
    uri: fileUri(VALID_CID),
    submitter: SUBMITTER,
  },
  ...overrides,
});

const ts = (seconds: number): Date => new Date(seconds * 1000);

describe("decodeAnchorRows", () => {
  it("emits one row per log with a parseable anchor payload", () => {
    const logs = [
      makeLog({ transactionHash: "0x" + "11".repeat(32) as `0x${string}`, logIndex: 0 }),
      makeLog({ transactionHash: "0x" + "22".repeat(32) as `0x${string}`, logIndex: 1 }),
    ];
    const blockTimestamps = new Map([[1_000n, ts(1_700_000_000)]]);

    const rows = decodeAnchorRows(logs, blockTimestamps, CHAIN, REGISTRY);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.cid).toBe(VALID_CID);
    expect(rows[0]!.submitter).toBe(SUBMITTER);
    expect(rows[1]!.logIndex).toBe(1);
  });

  it("preserves the per-block timestamp from the caller-built cache", () => {
    const blockA = 100n;
    const blockB = 200n;
    const logs = [
      makeLog({ blockNumber: blockA, transactionHash: "0x" + "aa".repeat(32) as `0x${string}`, logIndex: 0 }),
      makeLog({ blockNumber: blockB, transactionHash: "0x" + "bb".repeat(32) as `0x${string}`, logIndex: 1 }),
    ];
    const blockTimestamps = new Map([
      [blockA, ts(1_700_000_000)],
      [blockB, ts(1_700_000_005)],
    ]);
    const rows = decodeAnchorRows(logs, blockTimestamps, CHAIN, REGISTRY);
    expect(rows[0]!.blockTimestamp).toEqual(ts(1_700_000_000));
    expect(rows[1]!.blockTimestamp).toEqual(ts(1_700_000_005));
  });

  it("drops logs whose block isn't in the timestamp cache (defensive)", () => {
    const logs = [
      makeLog({
        blockNumber: 999n,
        transactionHash: "0x" + "ee".repeat(32) as `0x${string}`,
        logIndex: 0,
      }),
    ];
    // Cache only carries block 1000, not 999.
    const blockTimestamps = new Map([[1_000n, ts(1)]]);
    expect(decodeAnchorRows(logs, blockTimestamps, CHAIN, REGISTRY)).toEqual([]);
  });

  it("drops logs whose `uri` is not a parseable anchor payload", () => {
    const logs = [
      makeLog({
        args: { uri: "not a fileonchain anchor", submitter: SUBMITTER },
        transactionHash: "0x" + "11".repeat(32) as `0x${string}`,
        logIndex: 0,
      }),
      makeLog({
        args: { uri: JSON.stringify({ p: "fileonchain", v: 2, op: "garbage" }), submitter: SUBMITTER },
        transactionHash: "0x" + "22".repeat(32) as `0x${string}`,
        logIndex: 1,
      }),
      makeLog({
        // Wrong cid shape — must be CIDv1 base32.
        args: { uri: JSON.stringify({ p: "fileonchain", v: 1, op: "anchor", cid: "too-short" }), submitter: SUBMITTER },
        transactionHash: "0x" + "33".repeat(32) as `0x${string}`,
        logIndex: 2,
      }),
    ];
    const blockTimestamps = new Map([[1_000n, ts(1)]]);
    expect(decodeAnchorRows(logs, blockTimestamps, CHAIN, REGISTRY)).toEqual([]);
  });

  it("drops logs whose `uri` is missing or non-string", () => {
    const logs = [
      makeLog({ args: { uri: undefined, submitter: SUBMITTER } }),
      makeLog({ args: { uri: 42, submitter: SUBMITTER } }),
      makeLog({ args: { uri: null, submitter: SUBMITTER } }),
    ];
    const blockTimestamps = new Map([[1_000n, ts(1)]]);
    expect(decodeAnchorRows(logs, blockTimestamps, CHAIN, REGISTRY)).toEqual([]);
  });

  it("drops logs whose submitter isn't a 0x-prefixed 20-byte hex address", () => {
    const logs = [
      makeLog({
        args: { uri: fileUri(VALID_CID), submitter: "not-an-address" },
      }),
      makeLog({
        args: { uri: fileUri(VALID_CID), submitter: 42 },
      }),
    ];
    const blockTimestamps = new Map([[1_000n, ts(1)]]);
    expect(decodeAnchorRows(logs, blockTimestamps, CHAIN, REGISTRY)).toEqual([]);
  });

  it("normalizes the submitter to lowercase so the same address matches across log sources", () => {
    const mixedCase = "0xABCDEF0000000000000000000000000000000001" as `0x${string}`;
    const logs = [
      makeLog({ args: { uri: fileUri(VALID_CID), submitter: mixedCase } }),
    ];
    const blockTimestamps = new Map([[1_000n, ts(1)]]);
    const rows = decodeAnchorRows(logs, blockTimestamps, CHAIN, REGISTRY);
    expect(rows[0]!.submitter).toBe(
      "0xabcdef0000000000000000000000000000000001",
    );
  });

  it("drops logs missing transactionHash or blockNumber (defensive)", () => {
    const logs = [
      makeLog({ transactionHash: null, logIndex: 0 }),
      makeLog({ transactionHash: undefined, logIndex: 0 }),
      makeLog({ blockNumber: null, logIndex: 0 }),
      makeLog({ blockNumber: undefined, logIndex: 0 }),
      makeLog({ logIndex: null }),
    ];
    const blockTimestamps = new Map([[1_000n, ts(1)]]);
    expect(decodeAnchorRows(logs, blockTimestamps, CHAIN, REGISTRY)).toEqual([]);
  });

  it("returns an empty array for an empty input list", () => {
    expect(decodeAnchorRows([], new Map(), CHAIN, REGISTRY)).toEqual([]);
  });
});
