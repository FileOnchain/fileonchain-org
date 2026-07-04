/**
 * Shared types for FileOnChain — used by the SDK clients, the reference
 * frontend, and any third-party integration.
 */

export type ChainFamily =
  | "evm"
  | "substrate"
  | "solana"
  | "aptos"
  | "cosmos"
  | "sui"
  | "starknet"
  | "near"
  | "tron"
  | "cardano"
  | "ton"
  | "hedera";

/**
 * Branded chain id. Use as a primary key in maps and as a URL segment.
 * Examples: "evm:1", "substrate:autonomys-mainnet", "solana:mainnet".
 */
export type ChainId = `${ChainFamily}:${string}`;

/**
 * Resolved on-chain registry record for a CID anchor.
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
