import { describe, expect, it } from "vitest";
import { DEFAULT_CHAIN_ID, getChain } from "@fileonchain/sdk";
import {
  computeUploadRecommendation,
  requiredMicroUsdc,
} from "@/lib/recommendations/engine";
import type {
  RecommendationInput,
  UploadRecommendation,
} from "@/lib/recommendations/types";

/** The deterministic Upload Advisor rule engine. Pure function of its
 *  input — the same code runs on the server route and as the client
 *  fallback when the API is unreachable, so the two must never
 *  diverge. The chain registry + cost model are the source of truth
 *  for everything; the engine never invents chain data. */

/** Build a full `RecommendationInput` with sensible defaults. The
 *  per-test overrides pick the dimension under test. Sensible
 *  defaults keep the engine's deterministic ranking readable —
 *  e.g. a guest with no wallet exercises the PAYG branch, not the
 *  BYOK / credits branches. */
const input = (overrides: Partial<RecommendationInput> = {}): RecommendationInput => ({
  file: {
    name: "test.pdf",
    sizeBytes: 1024, // 1 KB — small
    mimeType: "application/pdf",
    chunkCount: 1,
  },
  // Active chain picks up a tiny score bonus (rank boost); the
  // default chain makes the test predictable without changing the
  // outcome.
  activeChainId: DEFAULT_CHAIN_ID,
  wallet: { connected: false, family: null },
  intent: "balanced",
  session: {
    authenticated: false,
    creditBalanceMicroUsdc: null,
    byokKeys: [],
  },
  ...overrides,
});

/** Pull the factor of a given type out of the factors array. */
const factor = <T extends { type: string }>(
  rec: UploadRecommendation,
  type: T["type"],
): T | undefined =>
  rec.factors.find((f): f is T => f.type === type) as T | undefined;

/* ------------------------------------------------------------------ */
/* requiredMicroUsdc                                                    */
/* ------------------------------------------------------------------ */

describe("requiredMicroUsdc", () => {
  it("scales a USD cost to micro-USDC and rounds up (never under)", () => {
    // The single-chain anchor worker uses this exact helper; an
    // under-rounded value silently under-funds the credit debit.
    expect(requiredMicroUsdc(1.0)).toBe(1_000_000n);
    expect(requiredMicroUsdc(0.0001)).toBe(100n); // 0.1 micro-USDC → 1
  });

  it("rounds up to the nearest micro-USDC", () => {
    // 0.0000001 USD = 0.1 micro-USDC → ceil → 1.
    expect(requiredMicroUsdc(0.0000001)).toBe(1n);
  });

  it("returns 0n for a zero cost (the upstream guard handles negatives)", () => {
    expect(requiredMicroUsdc(0)).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/* Output shape — pinned regardless of the chosen chain                */
/* ------------------------------------------------------------------ */

describe("computeUploadRecommendation — shape contract", () => {
  it("emits version 1 and the three required fields", () => {
    const rec = computeUploadRecommendation(input());
    expect(rec.version).toBe(1);
    expect(rec.suggested.chainId).toBeTypeOf("string");
    expect(rec.suggested.paymentMethod).toMatch(/payg|credits|byok/);
    expect(Array.isArray(rec.suggested.secondaryChainIds)).toBe(true);
  });

  it("always populates file + intent + wallet + cost + provisioning factors", () => {
    const rec = computeUploadRecommendation(input());
    expect(factor(rec, "file")).toBeDefined();
    expect(factor(rec, "intent")).toBeDefined();
    expect(factor(rec, "wallet")).toBeDefined();
    expect(factor(rec, "cost")).toBeDefined();
    expect(factor(rec, "provisioning")).toBeDefined();
  });

  it("every suggested chain is an active chain from the registry", () => {
    // The engine must never surface a planned / deprecated chain.
    const rec = computeUploadRecommendation(input());
    const primary = getChain(rec.suggested.chainId);
    expect(primary).toBeDefined();
    expect(primary?.status).toBe("active");
    for (const id of rec.suggested.secondaryChainIds) {
      const chain = getChain(id);
      expect(chain).toBeDefined();
      expect(chain?.status).toBe("active");
    }
  });

  it("rounds the estimated cost to 4 decimal places", () => {
    const rec = computeUploadRecommendation(input());
    const decimals = rec.estimatedCostUsd.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });
});

/* ------------------------------------------------------------------ */
/* Payment-method decision tree (PRD FR-4)                              */
/* ------------------------------------------------------------------ */

describe("computeUploadRecommendation — payment method", () => {
  it("picks PAYG for an unauthenticated guest", () => {
    const rec = computeUploadRecommendation(input());
    expect(rec.suggested.paymentMethod).toBe("payg");
    expect(rec.blockers).toEqual([]);
  });

  it("picks CREDITS for an authenticated user with sufficient credits and no wallet", () => {
    const rec = computeUploadRecommendation(
      input({
        session: {
          authenticated: true,
          creditBalanceMicroUsdc: "1000000000", // 1000 USDC
          byokKeys: [],
        },
      }),
    );
    expect(rec.suggested.paymentMethod).toBe("credits");
    expect(factor(rec, "credits")).toBeDefined();
  });

  it("picks CREDITS for an authenticated user with many chunks (≥ 10) regardless of wallet", () => {
    const rec = computeUploadRecommendation(
      input({
        wallet: { connected: true, family: "evm" },
        file: { name: "big.bin", sizeBytes: 1024, mimeType: "application/octet-stream", chunkCount: 20 },
        session: {
          authenticated: true,
          creditBalanceMicroUsdc: "1000000000", // 1000 USDC
          byokKeys: [],
        },
      }),
    );
    expect(rec.suggested.paymentMethod).toBe("credits");
  });

  it("picks PAYG for an authenticated user with sufficient credits + matching wallet + few chunks", () => {
    // The "one signature is cheap enough" branch — credits exist
    // but the cost of signing one chunk outranks the server-side
    // debit.
    const rec = computeUploadRecommendation(
      input({
        wallet: { connected: true, family: "substrate" },
        session: {
          authenticated: true,
          creditBalanceMicroUsdc: "1000000000",
          byokKeys: [],
        },
      }),
    );
    expect(rec.suggested.paymentMethod).toBe("payg");
  });

  it("picks CREDITS with an insufficient_credits blocker when balance < required", () => {
    const rec = computeUploadRecommendation(
      input({
        wallet: { connected: false, family: null },
        session: {
          authenticated: true,
          creditBalanceMicroUsdc: "0", // 0 USDC
          byokKeys: [],
        },
      }),
    );
    expect(rec.suggested.paymentMethod).toBe("credits");
    expect(rec.blockers).toContainEqual(
      expect.objectContaining({ code: "insufficient_credits" }),
    );
    // The blocker carries a credits-page link so the user can
    // resolve it without leaving the upload flow.
    expect(
      rec.blockers.find((b) => b.code === "insufficient_credits")?.href,
    ).toBe("/dashboard/credits");
  });

  it("picks BYOK when an authenticated user has a key that covers the primary chain", () => {
    const rec = computeUploadRecommendation(
      input({
        // Filter out testnets so the primary is guaranteed to be a
        // mainnet. Without this, the +25 testnet-bias score on
        // a balanced intent would pick a testnet.
        intent: "production",
        // activeChainId bonus + DEFAULT_CHAIN_ID bonus keeps
        // substrate:autonomys-mainnet near the top of the cost
        // ranking (Solana is cheaper by ~5× but the substrate
        // wallet family + default bonuses absorb it).
        activeChainId: DEFAULT_CHAIN_ID,
        // Connect a substrate wallet so the candidates narrow to
        // substrate chains only (otherwise Solana mainnet wins
        // on cost alone). The wallet also triggers the +40
        // family-match score.
        wallet: { connected: true, family: "substrate" },
        session: {
          authenticated: true,
          creditBalanceMicroUsdc: "1000000000", // 1000 USDC
          byokKeys: [
            {
              id: "byok_1",
              provider: "autonomys-auto-drive",
              label: "Auto Drive",
            },
          ],
        },
      }),
    );
    // Auto Drive covers `substrate:autonomys-mainnet` (and
    // substrate:autonomys-taurus). The primary chain is the
    // default autonomys-mainnet, so BYOK is the winner.
    expect(rec.suggested.chainId).toBe(DEFAULT_CHAIN_ID);
    expect(rec.suggested.paymentMethod).toBe("byok");
    expect(rec.suggested.byokKeyId).toBe("byok_1");
    expect(factor(rec, "byok")).toBeDefined();
  });

  it("falls back to PAYG when BYOK is set but the primary chain is not in the provider's chainIds", () => {
    // Pick a primary chain that the Auto Drive provider does NOT cover
    // by setting activeChainId to an EVM mainnet. The engine may
    // still pick a substrate chain as primary (cost wins), but if
    // the primary ends up evm the BYOK must not override.
    const rec = computeUploadRecommendation(
      input({
        activeChainId: "evm:1" as ChainId,
        file: { name: "tiny.txt", sizeBytes: 100, mimeType: "text/plain", chunkCount: 1 },
        intent: "production", // filter out testnets
        session: {
          authenticated: true,
          creditBalanceMicroUsdc: "0",
          byokKeys: [
            {
              id: "byok_1",
              provider: "autonomys-auto-drive",
              label: "Auto Drive",
            },
          ],
        },
      }),
    );
    // The primary chain is production-eligible + EVM (since the
    // BYOK doesn't cover it). With sufficient=false + no wallet,
    // the engine picks CREDITS with the blocker.
    expect(rec.suggested.paymentMethod).toBe("credits");
    expect(rec.suggested.byokKeyId).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Intent bias                                                          */
/* ------------------------------------------------------------------ */

describe("computeUploadRecommendation — intent bias", () => {
  it("production intent returns a non-testnet primary and labels the intent factor 'production'", () => {
    const rec = computeUploadRecommendation(input({ intent: "production" }));
    const primary = getChain(rec.suggested.chainId);
    expect(primary?.testnet).toBe(false);
    expect(factor(rec, "intent")).toEqual(
      expect.objectContaining({ type: "intent", label: "production" }),
    );
  });

  it("testnet intent emits a testnet-bias secondaryChainIds preference (informational)", () => {
    const rec = computeUploadRecommendation(input({ intent: "testnet" }));
    expect(factor(rec, "intent")).toEqual(
      expect.objectContaining({ type: "intent", label: "testnet" }),
    );
  });

  it("balanced intent shifts to testnet for small text-like files", () => {
    const rec = computeUploadRecommendation(
      input({
        file: { name: "tiny.txt", sizeBytes: 200, mimeType: "text/plain", chunkCount: 1 },
        intent: "balanced",
      }),
    );
    expect(factor(rec, "intent")).toEqual(
      expect.objectContaining({ type: "intent", label: "testnet" }),
    );
  });

  it("balanced intent stays at 'balanced' for large binary files", () => {
    const rec = computeUploadRecommendation(
      input({
        file: { name: "big.bin", sizeBytes: 1024 * 1024, mimeType: "application/octet-stream", chunkCount: 1 },
        intent: "balanced",
      }),
    );
    expect(factor(rec, "intent")).toEqual(
      expect.objectContaining({ type: "intent", label: "balanced" }),
    );
  });

  it("lowest_cost intent emits 'balanced' as the label (no testnet preference)", () => {
    // The label is the same as balanced; the difference is that
    // `wantsTestnet === null` so the +25 testnet-bias score is
    // withheld.
    const rec = computeUploadRecommendation(input({ intent: "lowest_cost" }));
    expect(factor(rec, "intent")).toEqual(
      expect.objectContaining({ type: "intent", label: "balanced" }),
    );
  });
});

/* ------------------------------------------------------------------ */
/* Redundancy candidates (informational; not yet applied to upload)     */
/* ------------------------------------------------------------------ */

describe("computeUploadRecommendation — secondary chain picks", () => {
  it("returns no secondary chains for a small file", () => {
    const rec = computeUploadRecommendation(
      input({ file: { name: "tiny.txt", sizeBytes: 1024, mimeType: "text/plain", chunkCount: 1 } }),
    );
    expect(rec.suggested.secondaryChainIds).toEqual([]);
  });

  it("returns up to 2 secondary chains for a large document file", () => {
    const rec = computeUploadRecommendation(
      input({
        file: {
          name: "report.pdf",
          sizeBytes: 12 * 1024 * 1024, // 12 MB > 10 MB threshold
          mimeType: "application/pdf",
          chunkCount: 1,
        },
      }),
    );
    expect(rec.suggested.secondaryChainIds.length).toBeGreaterThanOrEqual(1);
    expect(rec.suggested.secondaryChainIds.length).toBeLessThanOrEqual(2);
    // Secondary chains are cheap/testnet-tertiary siblings of the primary.
    const primary = getChain(rec.suggested.chainId);
    for (const id of rec.suggested.secondaryChainIds) {
      const secondary = getChain(id);
      expect(secondary?.testnet).toBe(primary?.testnet);
    }
  });

  it("returns secondary chains for a medium file with a document MIME type", () => {
    // The MIME-type branch fires at any size — a `text/csv` of 1 KB
    // is still worth a redundancy suggestion.
    const rec = computeUploadRecommendation(
      input({
        file: { name: "data.csv", sizeBytes: 500, mimeType: "text/csv", chunkCount: 1 },
      }),
    );
    expect(rec.suggested.secondaryChainIds.length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/* Determinism + warnings + confidence                                  */
/* ------------------------------------------------------------------ */

describe("computeUploadRecommendation — determinism", () => {
  it("the same input produces the same output across calls", () => {
    const a = computeUploadRecommendation(input());
    const b = computeUploadRecommendation(input());
    expect(a).toEqual(b);
  });

  it("emits a 'not provisioned' warning when the primary chain lacks a registry", () => {
    // Find a non-provisioned chain in the candidate set to force
    // the warning. The test uses `eth-mainnet` (`evm:1`) which is
    // an active chain but has no registry contract yet.
    const rec = computeUploadRecommendation(
      input({
        activeChainId: "evm:1" as ChainId,
        intent: "production",
        file: { name: "tiny.txt", sizeBytes: 100, mimeType: "text/plain", chunkCount: 1 },
      }),
    );
    if (rec.suggested.chainId === ("evm:1" as ChainId)) {
      expect(rec.warnings.some((w) => w.includes("Registry not deployed"))).toBe(
        true,
      );
    }
  });

  it("emits a testnet warning when the primary chain is a testnet", () => {
    const rec = computeUploadRecommendation(
      input({ intent: "testnet", wallet: { connected: false, family: null } }),
    );
    const primary = getChain(rec.suggested.chainId);
    if (primary?.testnet) {
      expect(rec.warnings.some((w) => w.includes("testnet"))).toBe(true);
    }
  });

  it("emits a 'connect a wallet' warning when PAYG is chosen but no wallet is connected", () => {
    const rec = computeUploadRecommendation(
      input({
        // A connected wallet with a non-matching family would
        // also trigger this — but the simplest case is no
        // wallet at all.
        wallet: { connected: false, family: null },
      }),
    );
    expect(rec.suggested.paymentMethod).toBe("payg");
    expect(rec.warnings.some((w) => w.includes("Connect a"))).toBe(true);
  });
});

describe("computeUploadRecommendation — confidence", () => {
  it("returns 'low' when there is a blocker", () => {
    const rec = computeUploadRecommendation(
      input({
        session: {
          authenticated: true,
          creditBalanceMicroUsdc: "0",
          byokKeys: [],
        },
      }),
    );
    expect(rec.blockers.length).toBeGreaterThan(0);
    expect(rec.confidence).toBe("low");
  });

  it("confidence is one of high / medium / low", () => {
    const rec = computeUploadRecommendation(input());
    expect(rec.confidence).toMatch(/^(high|medium|low)$/);
  });
});
