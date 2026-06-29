import { CHAINS, getChain } from "@/lib/chains/registry";
import type { ChainId } from "@/types/types";

/* TODO: wire to The Graph / Goldsky / Subscan / Solana RPC / Aptos indexer */

export interface SearchHit {
  chainId: ChainId;
  chainName: string;
  chainShortName: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  status: "anchored" | "pending" | "missing";
  chunkIndex?: number;
}

/**
 * Seed CIDs that the indexer returns rich multi-chain data for. Lets the
 * explorer demo work without a real backend.
 */
const SEED_CIDS: string[] = [
  "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  "bafybeibv3zaicqsdwfmq5dym6ipxzl5qxksirv3d3uyzjqhs2dtx3w3c3q",
  "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
  "bafybeif2p5yvxkblz6vquj4qfq5dym6ipxzl5qxksirv3d3uyzjqhs2dtz",
  "bafybeic5vdqqvkqxgkxq5dym6ipxzl5qxksirv3d3uyzjqhs2dtxt4zabc",
  "bafybeih73xzvp4w5dym6ipxzl5qxksirv3d3uyzjqhs2dtxtrrtr7xsdef",
  "bafybeig4sh5vwifi6e2kqxgkxq5dym6ipxzl5qxksirv3d3uyzjqhs2xyz",
  "bafybeibzvs5wvx7g42gqxgkxq5dym6ipxzl5qxksirv3d3uyzjqhs2ghi9",
];

const SEED_FAMILIES: Array<"evm" | "substrate" | "solana" | "aptos"> = ["evm", "substrate", "solana", "aptos"];

/** Pseudo-random but deterministic hash for a (cid, chainId) pair. */
const seedHash = async (cid: string, chainId: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${cid}:${chainId}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return `0x${Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
};

/**
 * Search across all chains for CIDs matching the query. If the query is one
 * of the seeded CIDs, returns deterministic results. Otherwise does a
 * prefix match against the seed list.
 */
export const searchCID = async (query: string): Promise<SearchHit[]> => {
  await new Promise((r) => setTimeout(r, 250));

  const trimmed = query.trim();
  if (!trimmed) return [];

  const matches = SEED_CIDS.filter(
    (seed) => seed === trimmed || seed.startsWith(trimmed) || trimmed.startsWith(seed.slice(0, 24)),
  );

  const hitChainIds: ChainId[] = matches.flatMap(() =>
    CHAINS.filter((c) => SEED_FAMILIES.includes(c.family)).map((c) => c.id),
  );

  const hits: SearchHit[] = [];
  for (const chainId of hitChainIds) {
    const chain = getChain(chainId);
    if (!chain) continue;
    const txHash = await seedHash(trimmed, chainId);
    const blockSeed = parseInt(txHash.slice(2, 10), 16);
    const blockNumber = 18_000_000 + (blockSeed % 5_000_000);
    const timestamp = Math.floor(Date.now() / 1000) - (parseInt(txHash.slice(10, 18), 16) % (86_400 * 7));

    hits.push({
      chainId,
      chainName: chain.name,
      chainShortName: chain.shortName,
      txHash,
      blockNumber,
      timestamp,
      status: "anchored",
    });
  }

  return hits;
};