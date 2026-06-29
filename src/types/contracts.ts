import type { ChainId } from "./types";

/**
 * Strongly typed return shapes for our three contracts. Use these instead of
 * `any` when reading from a viem `readContract` call.
 */

export interface CIDRecord {
  contentHash: `0x${string}`;
  uri: string;
  blockNumber: bigint;
  timestamp: bigint;
  submitter: `0x${string}`;
}

export type CacheTier = 0 | 1 | 2; // SingleFile | Folder | Permanent

export interface CacheEntry {
  owner: `0x${string}`;
  fileId: `0x${string}`;
  expiresAt: bigint;
  active: boolean;
  allowList: readonly `0x${string}`[];
}

export type DonationRecipient = 0 | 1 | 2; // Platform | PerCID | PerChain

export interface DonationEvent {
  donor: `0x${string}`;
  recipient: `0x${string}`;
  amount: bigint;
  recipientType: DonationRecipient;
  target: `0x${string}`;
  memo: string;
  timestamp: bigint;
}

/**
 * Per-chain contract bundle — addresses for the three contracts on a given
 * chain. Substrate / Solana / Aptos chains return nulls for the EVM-specific
 * fields.
 */
export interface ChainContractBundle {
  registry: `0x${string}` | null;
  cache: `0x${string}` | null;
  donation: `0x${string}` | null;
  usdc: `0x${string}` | null;
  /** Substrate remark index. */
  pallet: string | null;
  /** Solana program id. */
  programId: string | null;
  /** Aptos module address. */
  moduleAddress: string | null;
}

export type ContractBundles = Record<ChainId, ChainContractBundle>;