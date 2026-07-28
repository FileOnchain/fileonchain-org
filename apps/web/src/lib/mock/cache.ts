import { keccak256, stringToBytes } from "viem";

export type CacheTier = "SingleFile" | "Folder" | "Permanent";

export interface CacheTierPricing {
  tier: CacheTier;
  label: string;
  description: string;
  /** Marketing price in USDC. Provisioned chains (Sepolia + Auto EVM
   *  Chronos) overwrite this with the live contract value at render
   *  time — see `lib/server/cache.ts:getCachePricing` and the
   *  `CachePricingTable` hydrate-on-mount flow. Kept here for the
   *  unprovisioned-chain fallback so the page stays explorable. */
  priceUsdc: number;
  durationDays: number | null;
  features: string[];
}

export const CACHE_PRICING: CacheTierPricing[] = [
  {
    tier: "SingleFile",
    label: "Single file",
    description: "Encrypt one file and pin it on FileOnChain's private storage tier.",
    priceUsdc: 1,
    durationDays: 30,
    features: ["Up to 100MB", "AES-GCM client-side encryption", "Owner + 3 grantees", "Auto-purge after expiry"],
  },
  {
    tier: "Folder",
    label: "Folder",
    description: "Encrypt and cache a folder (up to 100 files).",
    priceUsdc: 5,
    durationDays: 30,
    features: ["Up to 100 files", "Folder hierarchy preserved", "Owner + 10 grantees", "Auto-purge after expiry"],
  },
  {
    tier: "Permanent",
    label: "Permanent",
    description: "Encrypted permanent storage with no expiry.",
    priceUsdc: 50,
    durationDays: null,
    features: ["No size limit", "Permanent pinning", "Owner + unlimited grantees", "Revocable"],
  },
];

export interface MockCacheEntry {
  id: `0x${string}`;
  tier: CacheTier;
  cid: string;
  filename: string;
  sizeBytes: number;
  expiresAt: number | null;
  allowList: `0x${string}`[];
}

/* This module is the marketing-fallback / Zustand-seed seam for the
 * cache surfaces. Real read paths:
 *   - `lib/server/cache.ts:getCachePricing`      — live USDC prices + treasury
 *   - `lib/server/cache.ts:getUserCacheEntries`  — user's real entries via
 *                                                  `CachePaid` event scan + `getEntry`
 *
 * `MOCK_CACHE_ENTRIES` survives as the initial Zustand state only.
 * `CacheMyList` hydration calls `setEntries` on success and the store
 * flips `source: "real"`, clearing the seed.
 *
 * The contract doesn't store `cid` / `filename` / `sizeBytes` for an
 * entry — those need an off-chain `cache_entries` table (DB schema
 * follow-up). Until that ships, the `cid` slot on `MockCacheEntry`
 * carries the entryId bytes32 hex; the `filename` slot is a synthetic
 * label derived from the entryId. See `lib/server/cache.ts:25-31`. */

const seedEntry = (
  idSeed: string,
  tier: CacheTier,
  filename: string,
  sizeBytes: number,
  durationDays: number | null,
  allowList: `0x${string}`[] = [],
): MockCacheEntry => {
  const id = keccak256(stringToBytes(idSeed));
  return {
    id,
    tier,
    cid: `bafy${id.slice(2, 50)}`,
    filename,
    sizeBytes,
    expiresAt: durationDays
      ? Math.floor(Date.now() / 1000) + durationDays * 86_400
      : null,
    allowList,
  };
};

export const MOCK_CACHE_ENTRIES: MockCacheEntry[] = [
  seedEntry("cache-1", "SingleFile", "private-roadmap.pdf", 245_000, 30, [
    "0x1234567890123456789012345678901234567890",
  ]),
  seedEntry("cache-2", "Folder", "launch-assets/", 18_400_000, 30),
  seedEntry("cache-3", "Permanent", "founding-document.txt", 12_400, null, [
    "0xabcdef0123456789abcdef0123456789abcdef01",
  ]),
];