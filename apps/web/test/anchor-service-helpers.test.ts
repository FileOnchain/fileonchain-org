import { describe, expect, it } from "vitest";
import {
  AnchorRequestError,
  computeAnchorCostMicroUsdc,
  parseAnchorPayload,
  serializeJob,
} from "@/lib/server/anchor-service";

/** Pure helpers around the credits/BYOK anchor flow. `parseAnchorPayload`
 *  validates the body of every POST /api/uploads + POST /api/v1/anchor
 *  request — a regression here lets garbage through to the workers.
 *  `computeAnchorCostMicroUsdc` is the one source of truth for the
 *  server-side cost (the request body never declares its own price).
 *  `serializeJob` is the JSON shape every job-listing endpoints emits. */

/** A CIDv1 base32 string that survives `isValidCID`. */
const VALID_CID = "bafybeigdyrzt5sfp7udm7hu76ys7tep27uxxi5y5q3kxymtsv2t7xspbio";

const validBody = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  cid: VALID_CID,
  fileName: "test.bin",
  fileSizeBytes: 1024,
  chunkCount: 1,
  chainIds: ["substrate:autonomys-mainnet"],
  paymentMethod: "credits",
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* parseAnchorPayload — input validation contract                       */
/* ------------------------------------------------------------------ */

describe("parseAnchorPayload", () => {
  it("returns the typed payload for a well-formed credits body", () => {
    const payload = parseAnchorPayload(validBody());
    expect(payload).toEqual({
      cid: VALID_CID,
      fileName: "test.bin",
      fileSizeBytes: 1024,
      chunkCount: 1,
      chainIds: ["substrate:autonomys-mainnet"],
      paymentMethod: "credits",
      byokKeyId: undefined,
      platformId: undefined,
    });
  });

  it("accepts a byok payment method when byokKeyId is set", () => {
    const payload = parseAnchorPayload(
      validBody({ paymentMethod: "byok", byokKeyId: "byok_1" }),
    );
    expect(payload.paymentMethod).toBe("byok");
    expect(payload.byokKeyId).toBe("byok_1");
  });

  it("treats a missing body as an empty object (no crash)", () => {
    // The route hands the JSON-parsed body to the validator; null
    // bodies arrive when the JSON body is invalid. The error
    // message names the specific missing field, not "empty body".
    expect(() => parseAnchorPayload(null)).toThrow(AnchorRequestError);
    expect(() => parseAnchorPayload(undefined)).toThrow(AnchorRequestError);
  });

  it("throws when cid is missing or not a valid CIDv1", () => {
    expect(() => parseAnchorPayload(validBody({ cid: undefined }))).toThrow(
      "cid must be a CIDv1 base32 string",
    );
    expect(() => parseAnchorPayload(validBody({ cid: "too-short" }))).toThrow(
      "cid must be a CIDv1 base32 string",
    );
    expect(() => parseAnchorPayload(validBody({ cid: 42 }))).toThrow(
      "cid must be a CIDv1 base32 string",
    );
  });

  it("throws when fileName is missing or empty", () => {
    expect(() => parseAnchorPayload(validBody({ fileName: "" }))).toThrow(
      "fileName is required",
    );
    expect(() => parseAnchorPayload(validBody({ fileName: undefined }))).toThrow(
      "fileName is required",
    );
  });

  it("throws when fileSizeBytes is not a positive integer", () => {
    expect(() => parseAnchorPayload(validBody({ fileSizeBytes: 0 }))).toThrow(
      "fileSizeBytes must be a positive integer",
    );
    expect(() => parseAnchorPayload(validBody({ fileSizeBytes: -1 }))).toThrow(
      "fileSizeBytes must be a positive integer",
    );
    expect(() => parseAnchorPayload(validBody({ fileSizeBytes: 1.5 }))).toThrow(
      "fileSizeBytes must be a positive integer",
    );
    expect(() => parseAnchorPayload(validBody({ fileSizeBytes: "1024" }))).toThrow(
      "fileSizeBytes must be a positive integer",
    );
  });

  it("throws when chunkCount is out of [1, 100000] bounds", () => {
    expect(() => parseAnchorPayload(validBody({ chunkCount: 0 }))).toThrow(
      "chunkCount must be an integer in [1, 100000]",
    );
    expect(() => parseAnchorPayload(validBody({ chunkCount: 100_001 }))).toThrow(
      "chunkCount must be an integer in [1, 100000]",
    );
    expect(() => parseAnchorPayload(validBody({ chunkCount: 1.5 }))).toThrow(
      "chunkCount must be an integer in [1, 100000]",
    );
    expect(() => parseAnchorPayload(validBody({ chunkCount: "1" }))).toThrow(
      "chunkCount must be an integer in [1, 100000]",
    );
  });

  it("accepts chunkCount at the inclusive boundaries", () => {
    const min = parseAnchorPayload(validBody({ chunkCount: 1 }));
    expect(min.chunkCount).toBe(1);
    const max = parseAnchorPayload(validBody({ chunkCount: 100_000 }));
    expect(max.chunkCount).toBe(100_000);
  });

  it("throws when chainIds is empty or not an array", () => {
    expect(() => parseAnchorPayload(validBody({ chainIds: [] }))).toThrow(
      "chainIds must be a non-empty array",
    );
    expect(() => parseAnchorPayload(validBody({ chainIds: "evm:1" }))).toThrow(
      "chainIds must be a non-empty array",
    );
  });

  it("throws when any chain id is unknown to the registry", () => {
    expect(() =>
      parseAnchorPayload(validBody({ chainIds: ["evm:not-a-real-chain"] })),
    ).toThrow("Unknown chain id: evm:not-a-real-chain");
  });

  it("throws when a chain is planned or deprecated", () => {
    // Use the default chain (active) as the sanity check, then
    // assert that the validator catches a planned chain in the
    // list. `evm:1` is a planned entry in the SDK registry.
    expect(() =>
      parseAnchorPayload(validBody({ chainIds: ["substrate:autonomys-mainnet"] })),
    ).not.toThrow();
    expect(() =>
      parseAnchorPayload(validBody({ chainIds: ["substrate:autonomys-mainnet", "evm:1"] })),
    ).toThrow(/Chain evm:1 is planned/);
  });

  it("throws when paymentMethod is not 'credits' or 'byok'", () => {
    expect(() =>
      parseAnchorPayload(validBody({ paymentMethod: "payg" })),
    ).toThrow('paymentMethod must be "credits" or "byok"');
    expect(() => parseAnchorPayload(validBody({ paymentMethod: undefined }))).toThrow(
      'paymentMethod must be "credits" or "byok"',
    );
  });

  it("requires byokKeyId when paymentMethod is byok", () => {
    expect(() =>
      parseAnchorPayload(validBody({ paymentMethod: "byok", byokKeyId: undefined })),
    ).toThrow("byokKeyId is required for BYOK payment");
    expect(() =>
      parseAnchorPayload(validBody({ paymentMethod: "byok", byokKeyId: 42 })),
    ).toThrow("byokKeyId is required for BYOK payment");
  });

  it("throws when platformId is not a numeric string", () => {
    expect(() => parseAnchorPayload(validBody({ platformId: "abc" }))).toThrow(
      "platformId must be a numeric string",
    );
    expect(() => parseAnchorPayload(validBody({ platformId: 42 }))).toThrow(
      "platformId must be a numeric string",
    );
  });

  it("accepts a numeric string platformId", () => {
    const payload = parseAnchorPayload(validBody({ platformId: "42" }));
    expect(payload.platformId).toBe("42");
  });

  it("treats a non-string byokKeyId without byok paymentMethod as undefined", () => {
    // The validator coerces a non-string byokKeyId to undefined when
    // paymentMethod is credits — a stray field in the body is ignored.
    const payload = parseAnchorPayload(
      validBody({ paymentMethod: "credits", byokKeyId: 42 }),
    );
    expect(payload.byokKeyId).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* AnchorRequestError — error shape contract                           */
/* ------------------------------------------------------------------ */

describe("AnchorRequestError", () => {
  it("carries the message and default status 400", () => {
    const err = new AnchorRequestError("bad");
    expect(err.message).toBe("bad");
    expect(err.status).toBe(400);
    expect(err.name).toBe("AnchorRequestError");
  });

  it("carries an explicit status when supplied", () => {
    const err = new AnchorRequestError("no credits", 402);
    expect(err.status).toBe(402);
  });

  it("is throwable + catchable as Error", () => {
    try {
      throw new AnchorRequestError("oops", 422);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AnchorRequestError);
      expect((error as AnchorRequestError).status).toBe(422);
    }
  });

  it("parseAnchorPayload throws AnchorRequestError on bad input (not bare Error)", () => {
    try {
      parseAnchorPayload({});
    } catch (error) {
      expect(error).toBeInstanceOf(AnchorRequestError);
      // The default status on body-validation errors is 400.
      expect((error as AnchorRequestError).status).toBe(400);
    }
  });
});

/* ------------------------------------------------------------------ */
/* computeAnchorCostMicroUsdc — server-side cost                        */
/* ------------------------------------------------------------------ */

describe("computeAnchorCostMicroUsdc", () => {
  it("returns 0n for an empty chain list", () => {
    expect(computeAnchorCostMicroUsdc([], 1)).toBe(0n);
  });

  it("matches the per-chain cost model for a single cheap chain", () => {
    // Solana mainnet is one of the cheapest chains in the registry.
    const cost = computeAnchorCostMicroUsdc(["solana:mainnet"], 10);
    expect(cost).toBeGreaterThan(0n);
    // The total cost is at most a few USDC for 10 chunks of the
    // cheapest chain — the upper bound catches a regression that
    // accidentally multiplies or adds a zero.
    expect(cost).toBeLessThan(10_000_000n); // < 10 USDC
  });

  it("scales linearly with chunkCount (no double-billing)", () => {
    const cost1 = computeAnchorCostMicroUsdc(["solana:mainnet"], 1);
    const cost5 = computeAnchorCostMicroUsdc(["solana:mainnet"], 5);
    // cost5 must be roughly 5x cost1. Each chunk's USD cost rounds
    // up to the next micro-USDC, so 1-chunk and 5-chunk sums can
    // differ by a few micro-USDC — cheap chains are sub-cent per
    // chunk, so the rounding is the dominant signal.
    expect(cost5).toBeGreaterThan(cost1);
    expect(cost5).toBeLessThan(cost1 * 5n + 5n);
  });

  it("sums the cost across chains (allowing per-chain ceil rounding)", () => {
    const singleChain = computeAnchorCostMicroUsdc(["solana:mainnet"], 5);
    const twoChains = computeAnchorCostMicroUsdc(
      ["solana:mainnet", "solana:mainnet"],
      5,
    );
    // Each chain's cost is ceil-rounded independently, so the
    // summed total may be 1-2 micro-USDC under the doubled
    // single-chain value. The contract is "two chains cost more
    // than one", not "exactly double".
    expect(twoChains).toBeGreaterThan(singleChain);
    expect(twoChains).toBeLessThanOrEqual(singleChain * 2n);
  });

  it("skips chain ids that are not in the cost model (no credit charge)", () => {
    // A bogus chain id contributes nothing — the cost for [bogus,
    // solana] should equal the cost for [solana] alone.
    const validOnly = computeAnchorCostMicroUsdc(["solana:mainnet"], 5);
    const mixed = computeAnchorCostMicroUsdc(
      ["not-a-real-chain", "solana:mainnet"],
      5,
    );
    expect(mixed).toBe(validOnly);
  });

  it("uses ceil-rounding so a sub-cent cost never rounds down", () => {
    // 1 chunk on the cheapest chain is well under 1 micro-USDC;
    // the function still emits at least 1n micro-USDC because
    // Math.ceil rounds up zero/ultra-small values.
    const cost = computeAnchorCostMicroUsdc(["solana:mainnet"], 1);
    expect(cost).toBeGreaterThanOrEqual(1n);
  });
});

/* ------------------------------------------------------------------ */
/* serializeJob — JSON shape contract                                  */
/* ------------------------------------------------------------------ */

describe("serializeJob", () => {
  /** Build a minimal uploadJobs row for testing. The serializer
   *  reads these fields; the rest are defaulted. */
  const job = (overrides: Record<string, unknown> = {}): never =>
    ({
      id: "job_1",
      cid: VALID_CID,
      fileName: "test.bin",
      fileSizeBytes: 1024,
      chunkCount: 1,
      chainIds: ["substrate:autonomys-mainnet"],
      paymentMethod: "credits",
      status: "complete",
      costMicroUsdc: 100_000n,
      txHashes: ["0xabc"],
      createdAt: new Date("2026-07-04T15:30:00Z"),
      completedAt: new Date("2026-07-04T15:30:05Z"),
      // Other uploadJobs fields defaulted to undefined for the
      // serialize contract — the function only reads the listed
      // fields.
      ...overrides,
    }) as never;

  it("emits the documented JSON shape for a complete job", () => {
    const out = serializeJob(job());
    expect(out).toEqual({
      id: "job_1",
      cid: VALID_CID,
      fileName: "test.bin",
      fileSizeBytes: 1024,
      chunkCount: 1,
      chainIds: ["substrate:autonomys-mainnet"],
      paymentMethod: "credits",
      status: "complete",
      costMicroUsdc: "100000",
      txHashes: ["0xabc"],
      createdAt: "2026-07-04T15:30:00.000Z",
      completedAt: "2026-07-04T15:30:05.000Z",
    });
  });

  it("emits costMicroUsdc as a decimal string (not a number)", () => {
    // bigint → string is the contract; consumers can compare
    // decimal strings without precision loss.
    const out = serializeJob(job({ costMicroUsdc: 1_234_567n }));
    expect(out.costMicroUsdc).toBe("1234567");
    expect(typeof out.costMicroUsdc).toBe("string");
  });

  it("emits null for completedAt when the job is still pending", () => {
    const out = serializeJob(job({ completedAt: null }));
    expect(out.completedAt).toBeNull();
  });

  it("emits null for completedAt when the field is undefined", () => {
    const out = serializeJob(job({ completedAt: undefined }));
    expect(out.completedAt).toBeNull();
  });

  it("does not include DB-only fields like userId or apiKeyId", () => {
    // The serializer is the JSON API contract — non-public fields
    // must not leak. (fields like userId, apiKeyId, byokKeyId,
    // projectId would be a privacy leak if they appeared here.)
    const out = serializeJob(job());
    expect(out).not.toHaveProperty("userId");
    expect(out).not.toHaveProperty("apiKeyId");
    expect(out).not.toHaveProperty("byokKeyId");
    expect(out).not.toHaveProperty("projectId");
  });
});
