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
 * Cardano client. Anchors ride transaction metadata — no Plutus needed.
 * Payloads go under the CIP-20 message label 674 as `{ msg: [ …strings… ] }`;
 * Cardano metadata strings are capped at 64 bytes, so each versioned JSON
 * payload from `../anchor` is split into an ordered string array that
 * explorers and `parseAnchorPayload` (after joining) read back verbatim.
 * One payload per transaction; chains provision by flipping `memoAnchoring`
 * in the registry. Built against a minimal signer surface so the SDK stays
 * dependency-free — the caller adapts a CIP-30 wallet + tx builder (browser)
 * or a server-side builder to it.
 */

/** CIP-20 "message" label, so anchors render readably in every explorer. */
export const CARDANO_METADATA_LABEL = 674;

/** Protocol cap per metadata string. */
export const METADATA_STRING_LIMIT = 64;

/**
 * Split a payload into ≤64-char slices, in order. Splitting on characters
 * is safe: payloads are JSON, ASCII.
 */
export const splitForMetadata = (payload: string): string[] => {
  const chunks: string[] = [];
  for (let i = 0; i < payload.length; i += METADATA_STRING_LIMIT) {
    chunks.push(payload.slice(i, i + METADATA_STRING_LIMIT));
  }
  return chunks;
};

/** The inverse of `splitForMetadata`, for indexers. */
export const joinFromMetadata = (chunks: string[]): string => chunks.join("");

/**
 * The transport surface the client needs. Implementations submit a minimal
 * transaction (conventionally a self-payment) carrying
 * `{ [CARDANO_METADATA_LABEL]: { msg: messageChunks } }`, and resolve once
 * it is accepted.
 */
export interface CardanoAnchorSigner {
  /** Bech32 account address paying for and signing the transactions. */
  address: string;
  submitMetadataTransaction(messageChunks: string[]): Promise<{ txHash: string }>;
}

/** Resolve a provisioned `cardano:*` chain, or throw naming what's missing. */
export const resolveCardanoChain = (chainId: ChainId): ChainConfig => {
  const chain = getChain(chainId);
  if (!chain) throw new Error(`Unknown chain "${chainId}".`);
  if (chain.family !== "cardano") {
    throw new Error(`Chain "${chainId}" is not a Cardano chain; use the ${chain.family} client instead.`);
  }
  if (!chain.memoAnchoring && !chain.moduleAddress) {
    throw new ChainNotProvisionedError(chainId, "metadata anchoring is not enabled for this chain yet.");
  }
  return chain;
};

export interface CardanoAnchorParams extends BuildFileAnchorParams {
  /** A `cardano:*` chain id, e.g. "cardano:mainnet". */
  chainId: ChainId;
}

/** Anchor a single CID as one metadata transaction. */
export const anchorCIDWithMetadata = async (
  signer: CardanoAnchorSigner,
  { chainId, ...payload }: CardanoAnchorParams
): Promise<{ txHash: string; payload: string }> => {
  resolveCardanoChain(chainId);
  const serialized = buildFileAnchorPayload(payload);
  const { txHash } = await signer.submitMetadataTransaction(splitForMetadata(serialized));
  return { txHash, payload: serialized };
};

export interface CardanoChunkedAnchorParams {
  /** A `cardano:*` chain id, e.g. "cardano:mainnet". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is ignored — metadata holds CIDs, not bytes. */
  chunks: AnchorChunk[];
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk, then the file CID, as sequential metadata transactions —
 * each transaction carries exactly one payload, so a chunked anchor is N+1
 * txs. One wallet confirmation per transaction; the last one carries the
 * file anchor.
 */
export const anchorChunkedFile = async (
  signer: CardanoAnchorSigner,
  { chainId, fileCid, chunks, sha256, uri, onProgress }: CardanoChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveCardanoChain(chainId);
  const total = chunks.length;

  const payloads = chunks.map((chunk) =>
    buildChunkAnchorPayload({ fileCid, chunk, total })
  );
  payloads.push(buildFileAnchorPayload({ cid: fileCid, sha256, uri }));

  const txHashes: string[] = [];
  let chunksAnchored = 0;

  for (const payload of payloads) {
    onProgress?.({ stage: "signing", chunksAnchored, chunksTotal: total });
    const { txHash } = await signer.submitMetadataTransaction(splitForMetadata(payload));
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

  // No blockNumber — CIP-30 wallets return only the hash.
  return {
    chainId: chain.id,
    txHashes,
    txHash: txHashes[txHashes.length - 1],
    submitter: signer.address,
  };
};
