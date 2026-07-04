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
 * TON client. Anchors ride the text comment of a minimal self-transfer —
 * one versioned JSON payload from `../anchor` per transaction, so
 * `parseAnchorPayload` reads them straight off confirmed txs. Comment
 * cells, bounce flags, and BOC encoding are wallet/SDK specifics that stay
 * in the signer implementation (TON Connect or @ton/core), keeping the SDK
 * dependency-free; chains provision by flipping `memoAnchoring` in the
 * registry. A dedicated anchor contract can later land in `moduleAddress`.
 */

/**
 * Conservative comment budget. Text comments chain across cell refs, but
 * wallets and indexers handle ~1KB comfortably.
 */
export const DEFAULT_MAX_COMMENT_BYTES = 1000;

/**
 * The transport surface the client needs. Implementations send one minimal
 * self-transfer carrying `comment` as its text comment, and resolve once
 * it is in a block.
 */
export interface TonAnchorSigner {
  /** Account address paying for and signing the transactions. */
  address: string;
  sendCommentTransaction(comment: string): Promise<{ txHash: string }>;
}

/** Resolve a provisioned `ton:*` chain, or throw naming what's missing. */
export const resolveTonChain = (chainId: ChainId): ChainConfig => {
  const chain = getChain(chainId);
  if (!chain) throw new Error(`Unknown chain "${chainId}".`);
  if (chain.family !== "ton") {
    throw new Error(`Chain "${chainId}" is not a TON chain; use the ${chain.family} client instead.`);
  }
  if (!chain.memoAnchoring && !chain.moduleAddress) {
    throw new ChainNotProvisionedError(chainId, "comment anchoring is not enabled for this chain yet.");
  }
  return chain;
};

const assertCommentFits = (comment: string, maxBytes: number): void => {
  const bytes = new TextEncoder().encode(comment).length;
  if (bytes > maxBytes) {
    throw new Error(
      `Anchor payload is ${bytes} bytes but the chain accepts comments up to ${maxBytes} bytes.`,
    );
  }
};

export interface TonAnchorParams extends BuildFileAnchorParams {
  /** A `ton:*` chain id, e.g. "ton:mainnet". */
  chainId: ChainId;
  /** Override the per-chain comment byte budget. */
  maxCommentBytes?: number;
}

/** Anchor a single CID as one comment transaction. */
export const anchorCIDWithComment = async (
  signer: TonAnchorSigner,
  { chainId, maxCommentBytes = DEFAULT_MAX_COMMENT_BYTES, ...payload }: TonAnchorParams
): Promise<{ txHash: string; comment: string }> => {
  resolveTonChain(chainId);
  const comment = buildFileAnchorPayload(payload);
  assertCommentFits(comment, maxCommentBytes);
  const { txHash } = await signer.sendCommentTransaction(comment);
  return { txHash, comment };
};

export interface TonChunkedAnchorParams {
  /** A `ton:*` chain id, e.g. "ton:mainnet". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is ignored — comments hold CIDs, not bytes. */
  chunks: AnchorChunk[];
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  /** Override the per-chain comment byte budget. */
  maxCommentBytes?: number;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk, then the file CID, as sequential comment transactions
 * — comments hold exactly one payload each, so a chunked anchor is N+1 txs.
 * One wallet confirmation per transaction; the last one carries the file
 * anchor.
 */
export const anchorChunkedFile = async (
  signer: TonAnchorSigner,
  {
    chainId,
    fileCid,
    chunks,
    sha256,
    uri,
    maxCommentBytes = DEFAULT_MAX_COMMENT_BYTES,
    onProgress,
  }: TonChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveTonChain(chainId);
  const total = chunks.length;

  const comments = chunks.map((chunk) =>
    buildChunkAnchorPayload({ fileCid, chunk, total })
  );
  comments.push(buildFileAnchorPayload({ cid: fileCid, sha256, uri }));
  for (const comment of comments) assertCommentFits(comment, maxCommentBytes);

  const txHashes: string[] = [];
  let chunksAnchored = 0;

  for (const comment of comments) {
    onProgress?.({ stage: "signing", chunksAnchored, chunksTotal: total });
    const { txHash } = await signer.sendCommentTransaction(comment);
    txHashes.push(txHash);
    chunksAnchored = Math.min(chunksAnchored + 1, total);
    onProgress?.({ stage: "confirming", chunksAnchored, chunksTotal: total, txHash });
  }

  onProgress?.({
    stage: "confirmed",
    chunksAnchored: total,
    chunksTotal: total,
    txHash: txHashes[txHashes.length - 1],
  });

  return {
    chainId: chain.id,
    txHashes,
    txHash: txHashes[txHashes.length - 1],
    submitter: signer.address,
  };
};
