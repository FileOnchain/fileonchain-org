import {
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  ChainNotProvisionedError,
  type AnchorChunk,
  type AnchorProgressHandler,
  type BuildFileAnchorParams,
  type ChunkedAnchorReceipt,
} from "../anchor";
import { getChain, type ChainConfig } from "../chains";
import type { ChainId } from "../types";

/**
 * Sui client. Anchors call `<moduleAddress>::file_registry::anchor_cid(cid,
 * payload)` (contracts/sui) with the versioned JSON payloads from
 * `../anchor`. Sui programmable transaction blocks let many move calls share
 * one transaction and one wallet approval, so the client batches all chunk
 * anchors plus the file anchor into as few PTBs as possible. Built against a
 * minimal signer surface so the SDK stays dependency-free — the caller
 * adapts @mysten/sui (server) or a wallet-standard wallet (browser).
 */

/** Module function every anchor calls, namespaced under `moduleAddress`. */
export const ANCHOR_FUNCTION = "file_registry::anchor_cid" as const;

/** One `anchor_cid` move call: the CID being anchored and its payload. */
export interface SuiAnchorCall {
  cid: string;
  payload: string;
}

/**
 * The transport surface the client needs. `target` is
 * `` `${moduleAddress}::${ANCHOR_FUNCTION}` ``; implementations put each
 * call into one programmable transaction block and execute it.
 */
export interface SuiAnchorSigner {
  /** Account address paying for and signing the transactions. */
  address: string;
  executeAnchorCalls(
    target: string,
    calls: SuiAnchorCall[]
  ): Promise<{ digest: string; checkpoint?: number }>;
}

/**
 * Resolve a `sui:*` chain with a deployed anchoring module, or throw with a
 * message that says exactly what's missing.
 */
export const resolveSuiChain = (
  chainId: ChainId
): ChainConfig & { moduleAddress: string } => {
  const chain = getChain(chainId);
  if (!chain) throw new Error(`Unknown chain "${chainId}".`);
  if (chain.family !== "sui") {
    throw new Error(`Chain "${chainId}" is not a Sui chain; use the ${chain.family} client instead.`);
  }
  if (!chain.moduleAddress) {
    throw new ChainNotProvisionedError(chainId, "the anchoring Move module is not deployed yet.");
  }
  return chain as ChainConfig & { moduleAddress: string };
};

/**
 * Sui caps PTB commands at 1024; 128 keeps transactions comfortably under
 * gas and size budgets.
 */
export const DEFAULT_MAX_CALLS_PER_TX = 128;

export interface SuiAnchorParams extends BuildFileAnchorParams {
  /** A `sui:*` chain id, e.g. "sui:mainnet". */
  chainId: ChainId;
}

/** Anchor a single CID as a one-call PTB. */
export const anchorCID = async (
  signer: SuiAnchorSigner,
  { chainId, ...payload }: SuiAnchorParams
): Promise<{ digest: string; payload: string }> => {
  const chain = resolveSuiChain(chainId);
  const serialized = buildFileAnchorPayload(payload);
  const { digest } = await signer.executeAnchorCalls(
    `${chain.moduleAddress}::${ANCHOR_FUNCTION}`,
    [{ cid: payload.cid, payload: serialized }]
  );
  return { digest, payload: serialized };
};

export interface SuiChunkedAnchorParams {
  /** A `sui:*` chain id, e.g. "sui:mainnet". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is ignored — the module stores CIDs, not bytes. */
  chunks: AnchorChunk[];
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  /** Override how many move calls share one PTB. */
  maxCallsPerTx?: number;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk, then the file CID, batched into as few PTBs as
 * possible — one wallet confirmation per PTB, so most files anchor with a
 * single approval.
 */
export const anchorChunkedFile = async (
  signer: SuiAnchorSigner,
  {
    chainId,
    fileCid,
    chunks,
    sha256,
    uri,
    maxCallsPerTx = DEFAULT_MAX_CALLS_PER_TX,
    onProgress,
  }: SuiChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveSuiChain(chainId);
  const target = `${chain.moduleAddress}::${ANCHOR_FUNCTION}`;
  const total = chunks.length;

  const calls: SuiAnchorCall[] = chunks.map((chunk) => ({
    cid: chunk.cid,
    payload: buildChunkAnchorPayload({ fileCid, chunk, total }),
  }));
  // File anchor last, so indexers see it only after every chunk.
  calls.push({ cid: fileCid, payload: buildFileAnchorPayload({ cid: fileCid, sha256, uri }) });

  const batches: SuiAnchorCall[][] = [];
  for (let i = 0; i < calls.length; i += maxCallsPerTx) {
    batches.push(calls.slice(i, i + maxCallsPerTx));
  }

  const digests: string[] = [];
  let lastCheckpoint: number | undefined;
  let chunksAnchored = 0;

  for (const batch of batches) {
    onProgress?.({ stage: "signing", chunksAnchored, chunksTotal: total });
    const { digest, checkpoint } = await signer.executeAnchorCalls(target, batch);
    digests.push(digest);
    lastCheckpoint = checkpoint ?? lastCheckpoint;
    // The trailing file-level call is not a chunk, so cap at the total.
    chunksAnchored = Math.min(chunksAnchored + batch.length, total);
    onProgress?.({ stage: "confirming", chunksAnchored, chunksTotal: total, txHash: digest });
  }

  onProgress?.({
    stage: "confirmed",
    chunksAnchored: total,
    chunksTotal: total,
    txHash: digests[digests.length - 1],
  });

  return {
    chainId: chain.id,
    txHashes: digests,
    txHash: digests[digests.length - 1],
    blockNumber: lastCheckpoint,
    submitter: signer.address,
  };
};
