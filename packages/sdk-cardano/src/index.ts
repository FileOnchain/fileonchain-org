import {
  buildChunkedAnchorPayloads,
  buildFileAnchorPayload,
  ChainNotProvisionedError,
  resolveFamilyChain,
  runSequentialChunkedAnchor,
  type AnchorChunk,
  type AnchorProgressHandler,
  type BuildFileAnchorParams,
  type ChainConfig,
  type ChainId,
  type ChunkedAnchorReceipt,
} from "@fileonchain/utils";

/**
 * Cardano client. Anchors ride transaction metadata — no Plutus needed.
 * Payloads go under the CIP-20 message label 674 as `{ msg: [ …strings… ] }`;
 * Cardano metadata strings are capped at 64 bytes, so each versioned JSON
 * payload from `@fileonchain/utils` is split into an ordered string array
 * that explorers and `parseAnchorPayload` (after joining) read back
 * verbatim. One payload per transaction; chains provision by flipping
 * `memoAnchoring` in the registry. Built against a minimal signer surface so
 * the SDK stays dependency-free — the caller adapts a CIP-30 wallet + tx
 * builder (browser) or a server-side builder to it.
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
export const resolveCardanoChain = (chainId: ChainId): ChainConfig =>
  resolveFamilyChain(chainId, {
    family: "cardano",
    familyLabel: "a Cardano chain",
    assertProvisioned: (chain) => {
      if (!chain.memoAnchoring && !chain.moduleAddress) {
        throw new ChainNotProvisionedError(chainId, "metadata anchoring is not enabled for this chain yet.");
      }
    },
  });

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

  // No blockNumber in the receipt — CIP-30 wallets return only the hash.
  return runSequentialChunkedAnchor({
    chainId: chain.id,
    payloads: buildChunkedAnchorPayloads({ fileCid, chunks, sha256, uri }),
    chunksTotal: chunks.length,
    submitter: signer.address,
    send: (payload) => signer.submitMetadataTransaction(splitForMetadata(payload)),
    onProgress,
  });
};
