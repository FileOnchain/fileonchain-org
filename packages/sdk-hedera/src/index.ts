import {
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  ChainNotProvisionedError,
  type AnchorChunk,
  type AnchorProgressHandler,
  type BuildFileAnchorParams,
  type ChunkedAnchorReceipt,
} from "@fileonchain/utils";
import { getChain, type ChainConfig } from "@fileonchain/utils";
import type { ChainId } from "@fileonchain/utils";

/**
 * Hedera client. Anchors are Consensus Service (HCS) messages on the topic
 * named by `hcsTopicId` on the chain entry — one versioned JSON payload from
 * `../anchor` per message, so `parseAnchorPayload` reads them straight off
 * the topic stream. There is no gas; topic messages carry a small fixed fee,
 * and mirror nodes stream them back for indexing. Built against a minimal
 * signer surface so the SDK stays dependency-free — the caller adapts
 * @hashgraph/sdk (server) or HashConnect (browser) to it.
 */

/**
 * Single HCS message cap (chunked HCS messages exist but anchors never need
 * them). Payloads that don't fit are rejected up front, before signing.
 */
export const MAX_HCS_MESSAGE_BYTES = 1024;

/**
 * The transport surface the client needs. Implementations submit one
 * `TopicMessageSubmitTransaction` per call and resolve once consensus is
 * reached.
 */
export interface HederaAnchorSigner {
  /** Account id paying for and signing the transactions, e.g. "0.0.12345". */
  accountId: string;
  /** `txHash` is the Hedera transaction id (shard.realm.num@seconds.nanos form). */
  submitTopicMessage(topicId: string, message: string): Promise<{ txHash: string; sequenceNumber?: number }>;
}

/** Resolve a provisioned `hedera:*` chain, or throw naming what's missing. */
export const resolveHederaChain = (chainId: ChainId): ChainConfig & { hcsTopicId: string } => {
  const chain = getChain(chainId);
  if (!chain) throw new Error(`Unknown chain "${chainId}".`);
  if (chain.family !== "hedera") {
    throw new Error(`Chain "${chainId}" is not a Hedera chain; use the ${chain.family} client instead.`);
  }
  if (!chain.hcsTopicId) {
    throw new ChainNotProvisionedError(chainId, "no HCS topic is configured for this chain yet.");
  }
  return chain as ChainConfig & { hcsTopicId: string };
};

const assertMessageFits = (message: string): void => {
  const bytes = new TextEncoder().encode(message).length;
  if (bytes > MAX_HCS_MESSAGE_BYTES) {
    throw new Error(
      `Anchor payload is ${bytes} bytes but single HCS messages cap at ${MAX_HCS_MESSAGE_BYTES} bytes.`,
    );
  }
};

export interface HederaAnchorParams extends BuildFileAnchorParams {
  /** A `hedera:*` chain id, e.g. "hedera:mainnet". */
  chainId: ChainId;
}

/** Anchor a single CID as one HCS topic message. */
export const anchorCIDWithMessage = async (
  signer: HederaAnchorSigner,
  { chainId, ...payload }: HederaAnchorParams
): Promise<{ txHash: string; sequenceNumber?: number; message: string }> => {
  const chain = resolveHederaChain(chainId);
  const message = buildFileAnchorPayload(payload);
  assertMessageFits(message);
  const { txHash, sequenceNumber } = await signer.submitTopicMessage(chain.hcsTopicId, message);
  return { txHash, sequenceNumber, message };
};

export interface HederaChunkedAnchorParams {
  /** A `hedera:*` chain id, e.g. "hedera:mainnet". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is ignored — messages hold CIDs, not bytes. */
  chunks: AnchorChunk[];
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk, then the file CID, as sequential HCS messages —
 * messages hold exactly one payload each, so a chunked anchor is N+1
 * submissions. One wallet confirmation per message; the last one carries
 * the file anchor.
 */
export const anchorChunkedFile = async (
  signer: HederaAnchorSigner,
  { chainId, fileCid, chunks, sha256, uri, onProgress }: HederaChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveHederaChain(chainId);
  const total = chunks.length;

  const messages = chunks.map((chunk) =>
    buildChunkAnchorPayload({ fileCid, chunk, total })
  );
  messages.push(buildFileAnchorPayload({ cid: fileCid, sha256, uri }));
  for (const message of messages) assertMessageFits(message);

  const txHashes: string[] = [];
  let lastSequence: number | undefined;
  let chunksAnchored = 0;

  for (const message of messages) {
    onProgress?.({ stage: "signing", chunksAnchored, chunksTotal: total });
    const { txHash, sequenceNumber } = await signer.submitTopicMessage(chain.hcsTopicId, message);
    txHashes.push(txHash);
    lastSequence = sequenceNumber ?? lastSequence;
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
    blockNumber: lastSequence,
    submitter: signer.accountId,
  };
};
