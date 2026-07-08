import type { ChunkedAnchorReceipt } from "@fileonchain/sdk";
import { sendAptosAnchor } from "./aptos";
import { sendCardanoAnchor } from "./cardano";
import { sendCosmosAnchor } from "./cosmos";
import { sendEvmAnchor } from "./evm";
import { sendHederaAnchor } from "./hedera";
import { sendNearAnchor } from "./near";
import { sendSolanaAnchor } from "./solana";
import { sendStarknetAnchor } from "./starknet";
import { sendSubstrateAnchor } from "./substrate";
import { sendSuiAnchor } from "./sui";
import { sendTonAnchor } from "./ton";
import { sendTronAnchor } from "./tron";
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

/** Platform attribution for the propose/verify fee split (25% of the tip). */
const defaultPlatformId = (request: AnchorRequest): string =>
  request.platformId ??
  process.env.NEXT_PUBLIC_FILEONCHAIN_PLATFORM_ID ??
  request.chain.defaultPlatformId ??
  "1";

/**
 * Anchor a chunked file on the request's chain with real transactions,
 * routed per family. Throws ChainNotProvisionedError (from @fileonchain/sdk)
 * when the chain has nothing deployed to anchor against — callers decide
 * whether to surface that or fall back to a simulated anchor.
 */
export const anchorFileOnChain = async (
  rawRequest: AnchorRequest,
): Promise<AnchorOutcome> => {
  const request: AnchorRequest = { ...rawRequest, platformId: defaultPlatformId(rawRequest) };
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
    case "cosmos":
      receipt = await sendCosmosAnchor(request);
      break;
    case "sui":
      receipt = await sendSuiAnchor(request);
      break;
    case "starknet":
      receipt = await sendStarknetAnchor(request);
      break;
    case "near":
      receipt = await sendNearAnchor(request);
      break;
    case "tron":
      receipt = await sendTronAnchor(request);
      break;
    case "cardano":
      receipt = await sendCardanoAnchor(request);
      break;
    case "ton":
      receipt = await sendTonAnchor(request);
      break;
    case "hedera":
      receipt = await sendHederaAnchor(request);
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
