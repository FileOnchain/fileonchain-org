import { keccak256, stringToBytes } from "viem";
import type { ChainFamily } from "@fileonchain/sdk";
import type { ChainConfig } from "@fileonchain/sdk";

/* Real sends live in src/lib/anchor/* (per-family @fileonchain/sdk clients).
 * This mock remains the fallback for chains with nothing deployed yet —
 * useFileUploader falls back here on ChainNotProvisionedError. */

export interface MockUploadInput {
  cid: string;
  chain: ChainConfig;
  fileSize: number;
}

export interface MockUploadResult {
  chainId: string;
  family: ChainFamily;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  submitter: string;
  registryAddress: `0x${string}` | null;
}

/**
 * Mock the on-chain anchor step for any chain family. Always returns the same
 * shape so the UI can render a uniform registry card regardless of family.
 */
export const mockAnchorCID = async (input: MockUploadInput): Promise<MockUploadResult> => {
  // Simulate a 600-1200ms tx confirmation.
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));

  const seed = keccak256(stringToBytes(`${input.cid}:${input.chain.id}`));
  const blockNumber = 18_000_000 + Number(BigInt(seed.slice(0, 8)) % BigInt(5_000_000));

  let submitter = "0x0000000000000000000000000000000000000000";
  if (input.chain.family === "evm") {
    submitter = `0x${seed.slice(2, 42)}`;
  } else if (input.chain.family === "solana") {
    submitter = seed.slice(0, 44);
  } else if (input.chain.family === "aptos") {
    submitter = `0x${seed.slice(2, 66)}`;
  } else {
    submitter = `5${seed.slice(2, 47)}`;
  }

  return {
    chainId: input.chain.id,
    family: input.chain.family,
    txHash: seed,
    blockNumber,
    timestamp: Math.floor(Date.now() / 1000),
    submitter,
    registryAddress: input.chain.registryContract,
  };
};