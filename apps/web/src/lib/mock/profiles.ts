import { type ChainFamily } from "@fileonchain/sdk";
import { getUploaderAggregates } from "@/lib/mock/cid-indexer";

/* TODO: wire to a real identity registry (linked-wallet attestations) and
 * indexer-side aggregation. Linking a wallet should verify a signed message
 * from BOTH addresses before the pair is recorded onchain. */

/** A wallet attached to a profile — one per runtime family at most. */
export interface LinkedWallet {
  family: ChainFamily;
  address: string;
  /** Unix seconds when the link attestation was recorded. */
  linkedAt: number;
}

export interface ProfileStats {
  files: number;
  bytes: number;
  anchors: number;
  chains: number;
  donatedUsdc: number;
}

export interface PublicProfile {
  /** Canonical address — the profile's id in /profile/[address] URLs. */
  address: string;
  /** Family of the canonical address. */
  family: ChainFamily;
  /** Optional display handle (mock — a real one would come from ENS etc.). */
  handle?: string;
  linkedWallets: LinkedWallet[];
  stats: ProfileStats;
  /** Unix seconds of the profile's first indexed anchor. */
  firstSeen: number;
  /** 1-based leaderboard rank, undefined when not ranked. */
  rank?: number;
}

/* ----------------------------------------------------------------------------
 * Deterministic mock helpers — everything derives from the address string so
 * SSR and the client always agree.
 * --------------------------------------------------------------------------- */

const hashString = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
};

const HEX = "0123456789abcdef";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const charsFrom = (seed: string, alphabet: string, length: number): string => {
  let out = "";
  let h = hashString(seed);
  for (let i = 0; i < length; i++) {
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
    out += alphabet[h % alphabet.length];
  }
  return out;
};

/**
 * Deterministic companion address for a (primary address, family) pair, in
 * that family's canonical shape. Stands in for the wallet a user would
 * actually connect during a real link flow.
 */
export const mockLinkedAddress = (primary: string, family: ChainFamily): string => {
  const seed = `${primary}:${family}`;
  switch (family) {
    case "evm":
      return `0x${charsFrom(seed, HEX, 40)}`;
    case "aptos":
      return `0x${charsFrom(seed, HEX, 64)}`;
    case "substrate":
      return `5${charsFrom(seed, BASE58, 47)}`;
    case "solana":
      return charsFrom(seed, BASE58, 44);
    case "cosmos":
      return `cosmos1${charsFrom(seed, BASE58.toLowerCase(), 38)}`;
    case "sui":
    case "starknet":
      return `0x${charsFrom(seed, HEX, 64)}`;
    case "near":
      return `${charsFrom(seed, HEX, 12)}.near`;
    case "tron":
      return `T${charsFrom(seed, BASE58, 33)}`;
    case "cardano":
      return `addr1${charsFrom(seed, BASE58.toLowerCase(), 53)}`;
    case "ton":
      return `EQ${charsFrom(seed, BASE58, 46)}`;
    case "hedera":
      return `0.0.${(hashString(seed) % 9_000_000) + 1_000_000}`;
  }
};

/** Mock handles for the seeded uploaders so the leaderboard feels inhabited. */
const HANDLES = [
  "permaweb.eth",
  "chunkwright",
  "anchorsmith",
  "cidkeeper",
  "blockbinder",
  "ledgerloom",
] as const;

/** Which extra runtimes each seeded profile has linked (varies by address). */
const linkedFamiliesFor = (address: string): ChainFamily[] => {
  const all: ChainFamily[] = ["substrate", "solana", "aptos"];
  const n = hashString(address) % (all.length + 1);
  return all.slice(0, n);
};

const buildProfile = (
  address: string,
  stats: ProfileStats,
  index: number,
): PublicProfile => {
  const linkedWallets: LinkedWallet[] = linkedFamiliesFor(address).map(
    (family, i) => ({
      family,
      address: mockLinkedAddress(address, family),
      linkedAt: 1_735_689_600 + index * 86_400 * 11 + i * 86_400 * 3,
    }),
  );
  return {
    address,
    family: "evm",
    handle: HANDLES[index % HANDLES.length],
    linkedWallets,
    stats,
    firstSeen: 1_735_689_600 + index * 86_400 * 9,
  };
};

/* ----------------------------------------------------------------------------
 * Public surface
 * --------------------------------------------------------------------------- */

/**
 * Ranked leaderboard of uploaders. File/byte/anchor numbers come from the
 * cid-indexer aggregates so they always match the explorer; donation totals
 * are seeded here (TODO: aggregate real DonationEscrow events per donor).
 */
export const getLeaderboard = async (): Promise<PublicProfile[]> => {
  const aggregates = await getUploaderAggregates();
  const profiles = aggregates.map((agg, i) =>
    buildProfile(
      agg.address,
      {
        files: agg.files,
        bytes: agg.bytes,
        anchors: agg.anchors,
        chains: agg.chains,
        donatedUsdc: hashString(agg.address) % 40,
      },
      i,
    ),
  );
  profiles.sort(
    (a, b) => b.stats.anchors - a.stats.anchors || b.stats.bytes - a.stats.bytes,
  );
  return profiles.map((p, i) => ({ ...p, rank: i + 1 }));
};

/**
 * Resolve a profile by its canonical address OR any linked wallet address.
 * Unknown addresses get an empty profile (zero stats, no links) so any
 * freshly connected wallet still has a public page.
 */
export const getProfile = async (address: string): Promise<PublicProfile> => {
  const needle = address.trim();
  const lowered = needle.toLowerCase();
  const board = await getLeaderboard();
  const known = board.find(
    (p) =>
      p.address.toLowerCase() === lowered ||
      p.linkedWallets.some((w) => w.address.toLowerCase() === lowered),
  );
  if (known) return known;
  return {
    address: needle,
    family: guessFamily(needle),
    linkedWallets: [],
    stats: { files: 0, bytes: 0, anchors: 0, chains: 0, donatedUsdc: 0 },
    firstSeen: Math.floor(Date.now() / 1000),
  };
};

/** Best-effort family guess from an address's shape. */
export const guessFamily = (address: string): ChainFamily => {
  if (address.startsWith("0x")) {
    return address.length > 50 ? "aptos" : "evm";
  }
  return address.startsWith("5") ? "substrate" : "solana";
};
