import "server-only";
import { type ChainFamily } from "@fileonchain/sdk";
import { getUploaderAggregates } from "@/lib/indexer/queries";
import { mockLinkedAddress, guessFamily } from "@/lib/mock/wallet-fakes";

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
 * Server-only helpers (deterministic, DB-backed)
 * --------------------------------------------------------------------------- */

const hashString = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
};

/** Build a profile row from one uploader aggregate. */
const buildProfile = (
  address: string,
  stats: { files: number; bytes: number; anchors: number; chains: number; donatedUsdc: number },
  i: number,
): PublicProfile => {
  const family = guessFamily(address);
  const linkedWallets: LinkedWallet[] = [];
  for (const f of ["solana", "aptos", "substrate", "near", "cosmos"] as ChainFamily[]) {
    if (f === family) continue;
    linkedWallets.push({
      family: f,
      address: mockLinkedAddress(address, f),
      linkedAt: 1_700_000_000 + (i * 86_400) % (365 * 86_400),
    });
  }
  return {
    address,
    family,
    handle: hashString(address) % 1000 === 0 ? `handle.${(hashString(address) % 9999).toString(36)}` : undefined,
    linkedWallets,
    stats,
    firstSeen: 1_700_000_000 - ((hashString(address) % (365 * 86_400 * 3))),
  };
};

/**
 * Resolve any of a profile's linked addresses back to the canonical
 * profile, then merge in the indexer's uploader aggregates. The mock
 * derives the "linked wallet" set deterministically — a real identity
 * registry would resolve signed attestations instead.
 */
const resolveProfile = async (
  queryAddress: string,
): Promise<{ profile: PublicProfile; known: boolean } | null> => {
  const aggregates = await getUploaderAggregates();
  const matched = aggregates.find((agg) => {
    if (agg.address.toLowerCase() === queryAddress.toLowerCase()) return true;
    // Match any of the deterministic companion addresses — the public
    // profile page accepts both the canonical id and a linked one.
    for (const f of ["solana", "aptos", "substrate", "near", "cosmos"] as ChainFamily[]) {
      if (mockLinkedAddress(queryAddress, f).toLowerCase() === queryAddress.toLowerCase()) {
        return true;
      }
    }
    return false;
  });
  if (!matched) return null;
  const profile = buildProfile(
    matched.address,
    {
      files: matched.files,
      bytes: matched.bytes,
      anchors: matched.anchors,
      chains: matched.chains,
      donatedUsdc: hashString(matched.address) % 40,
    },
    aggregates.findIndex((a) => a.address === matched.address),
  );
  return { profile, known: matched.anchors > 0 };
};

/**
 * Ranked leaderboard of uploaders. File/anchor numbers come from the
 * indexer aggregates so they always match the explorer; donation
 * totals are seeded here (TODO: aggregate real DonationEscrow events
 * per donor).
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

/** Resolve an address (canonical or linked) to its public profile. */
export const getProfile = async (address: string): Promise<PublicProfile> => {
  const direct = await resolveProfile(address);
  if (direct) return direct.profile;

  // Fallback for an address with zero indexer activity — synthesize a
  // profile from the address shape alone so the page renders something
  // (with stats=0 + noindex robots). The page will already mark the
  // returned profile as "no public anchors" via the metadata helper.
  const family = guessFamily(address);
  return {
    address,
    family,
    handle: undefined,
    linkedWallets: [],
    stats: { files: 0, bytes: 0, anchors: 0, chains: 0, donatedUsdc: 0 },
    firstSeen: 0,
  };
};

/**
 * Look up a profile by a fallback that tries the canonical address
 * first, then any deterministic companion. Used by the public profile
 * page when the URL contains a linked-wallet address.
 */
export const resolveProfileByAddress = async (
  address: string,
): Promise<PublicProfile> => {
  const direct = await resolveProfile(address);
  if (direct) return direct.profile;
  // Try the canonical mapping: any linked address resolves to its primary.
  for (const f of ["solana", "aptos", "substrate", "near", "cosmos"] as ChainFamily[]) {
    const canonical = mockLinkedAddress(address, f);
    if (canonical !== address) {
      const r = await resolveProfile(canonical);
      if (r) return r.profile;
    }
  }
  return getProfile(address);
};