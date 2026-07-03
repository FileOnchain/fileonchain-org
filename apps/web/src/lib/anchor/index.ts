import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { sendAptosAnchor } from "./aptos";
import { sendEvmAnchor } from "./evm";
import { sendSolanaAnchor } from "./solana";
import { sendSubstrateAnchor } from "./substrate";
import type { AnchorOutcome, AnchorRequest } from "./types";

export type { AnchorOutcome, AnchorRequest } from "./types";

/** Keep the (stub) indexer fed with what just landed on-chain. */
const reportAnchoredUpload = (request: AnchorRequest, receipt: ChunkedAnchorReceipt) => {
  void fetch("/api/upload-fallback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      network: request.chain.id,
      cidList: request.chunks.map((chunk) => ({
        cid: chunk.cid,
        nextCid: chunk.nextCid,
      })),
      hash: receipt.txHash,
      blockNumber: receipt.blockNumber ?? 0,
    }),
  }).catch(() => {
    // Indexing is best-effort; the chain is the source of truth.
  });
};

/**
 * Anchor a chunked file on the request's chain with real transactions,
 * routed per family. Throws ChainNotProvisionedError (from @fileonchain/sdk)
 * when the chain has nothing deployed to anchor against — callers decide
 * whether to surface that or fall back to a simulated anchor.
 */
export const anchorFileOnChain = async (
  request: AnchorRequest,
): Promise<AnchorOutcome> => {
  let receipt: ChunkedAnchorReceipt;
  switch (request.chain.family) {
    case "evm":
      receipt = await sendEvmAnchor(request);
      break;
    case "substrate":
      receipt = await sendSubstrateAnchor(request);
      break;
    case "solana":
      receipt = await sendSolanaAnchor(request);
      break;
    case "aptos":
      receipt = await sendAptosAnchor(request);
      break;
  }

  reportAnchoredUpload(request, receipt);

  return {
    txHash: receipt.txHash,
    txHashes: receipt.txHashes,
    blockNumber: receipt.blockNumber,
    timestamp: Math.floor(Date.now() / 1000),
    submitter: receipt.submitter,
    simulated: false,
  };
};
