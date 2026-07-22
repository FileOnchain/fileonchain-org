import { keccak256, stringToBytes } from "viem";

export type CacheTier = "SingleFile" | "Folder" | "Permanent";

export interface CacheTierPricing {
  tier: CacheTier;
  label: string;
  description: string;
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

/* Unprovisioned chains fall back to this seed data — see
 * `lib/server/cache.ts` for the contract event scan that powers real
 * chains. */

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