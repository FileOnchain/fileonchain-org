/**
 * Shared types used across the chain registry, wallet, and UI layers.
 */

export type ChainFamily = "evm" | "substrate" | "solana" | "aptos";

/**
 * Branded chain id. Use as a primary key in maps and as a URL segment.
 * Examples: "evm:1", "substrate:autonomys-mainnet", "solana:mainnet".
 */
export type ChainId = `${ChainFamily}:${string}`;

export interface Account {
  address: string;
  meta: {
    genesisHash: string;
    name: string;
    source: string;
  };
  type: string;
}

/**
 * Resolved on-chain registry record for a CID anchor.
 * Populated by `lib/mock/registry.ts` today; will be populated from real
 * contract reads in a future phase.
 */
export interface CIDRegistryRecord {
  cid: string;
  chainId: ChainId;
  registryAddress: `0x${string}`;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  submitter: string;
  contentHash: string;
  uri: string;
  status: "anchored" | "pending" | "missing";
}