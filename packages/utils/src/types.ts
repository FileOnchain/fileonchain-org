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
 * Resolved on-chain registry record for a CID anchor: "anchored" once the
 * anchoring transaction is included, "pending" while in flight, "missing"
 * when the CID has no anchor on the chain.
 */
export interface CIDRegistryRecord {
  cid: string;
  chainId: ChainId;
  registryAddress: `0x${string}`;
  /**
   * Transaction hash / block of the anchoring send. Event-derived — present
   * on records resolved from logs or an indexer, absent when the record was
   * read straight from contract storage (which only keeps the first-write
   * record, not the tx that created it).
   */
  txHash?: string;
  blockNumber?: number;
  timestamp: number;
  submitter: string;
  contentHash: string;
  uri: string;
  status: "anchored" | "pending" | "missing";
}
