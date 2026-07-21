import { describe, expect, it } from "vitest";
import { SCAN_WINDOW_BLOCKS, CONFIRMED_TAG, RPC_TRANSPORT_OPTS } from "@/lib/scan-window";

/** Constants only — but the floor matters: every scanner + every
 *  anchor-worker viem client keys off these values, so any
 *  accidental drift gets caught here. */

describe("scan-window constants", () => {
  it("SCAN_WINDOW_BLOCKS is the 9999 safe-cap (under every public RPC's range filter)", () => {
    expect(SCAN_WINDOW_BLOCKS).toBe(9_999);
  });

  it("CONFIRMED_TAG is 'finalized' so crons stay reorg-safe", () => {
    expect(CONFIRMED_TAG).toBe("finalized");
  });

  it("RPC transport opts are bounded and reasonable for a Vercel cron tick", () => {
    // The transport caps must outlive the 12s Sepolia block time
    // but stay well under any Vercel function budget so a single
    // hung RPC can't stall the whole tick.
    expect(RPC_TRANSPORT_OPTS.timeout).toBeGreaterThanOrEqual(15_000);
    expect(RPC_TRANSPORT_OPTS.timeout).toBeLessThanOrEqual(60_000);
    expect(RPC_TRANSPORT_OPTS.retryCount).toBeGreaterThanOrEqual(2);
    expect(RPC_TRANSPORT_OPTS.retryDelay).toBeGreaterThan(0);
  });
});
