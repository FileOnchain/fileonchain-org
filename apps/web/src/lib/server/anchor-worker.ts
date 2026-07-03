import "server-only";
import { keccak256, stringToBytes } from "viem";
import type { ChainId } from "@fileonchain/sdk";
import type { UploadJobTx } from "@/lib/db/schema";

/* TODO: wire to real chain senders run by a funded server signer —
 * EVM: `@fileonchain/sdk/evm` anchorCID (blocked on registry deployments);
 * Substrate: utility.batch of system.remarkWithEvent per chunk, as in
 * apps/web/src/utils/uploadChunks.ts; Solana/Aptos: program/module clients
 * once programId/moduleAddress land in the SDK chain registry. */

/**
 * MOCK anchor worker — fabricates deterministic per-chain results the same
 * way `lib/mock/upload.ts` does client-side, so explorer links and hashes
 * stay stable across renders.
 */
export const runAnchorWorker = async (
  jobId: string,
  cid: string,
  chainIds: ChainId[],
): Promise<UploadJobTx[]> => {
  // Simulate a short confirmation wait without holding the request long.
  await new Promise((resolve) => setTimeout(resolve, 300));

  return chainIds.map((chainId) => {
    const seed = keccak256(stringToBytes(`fileonchain-job:${jobId}:${cid}:${chainId}`));
    const blockNumber = 1_000_000 + (parseInt(seed.slice(2, 10), 16) % 20_000_000);
    return { chainId, txHash: seed, blockNumber };
  });
};
