import {
  assertPayloadFits,
  buildChunkedAnchorPayloads,
  buildFileAnchorPayload,
  ChainNotProvisionedError,
  FAMILY_PAYLOAD_BUDGET_BYTES,
  resolveFamilyChain,
  runSequentialChunkedAnchor,
  utf8ByteLength,
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

/** Protocol cap per metadata string — 64 **bytes** when UTF-8 encoded. */
export const METADATA_STRING_LIMIT = 64;

/**
 * Split a payload into ordered slices of at most 64 UTF-8 **bytes** each —
 * the ledger counts encoded bytes, not characters. Splits only on code-point
 * boundaries, so multi-byte characters and surrogate pairs are never torn
 * across slices.
 */
export const splitForMetadata = (payload: string): string[] => {
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  // for..of iterates code points, so a surrogate pair stays together.
  for (const char of payload) {
    const charBytes = utf8ByteLength(char);
    if (current && currentBytes + charBytes > METADATA_STRING_LIMIT) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current) chunks.push(current);
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
const assertCardanoPayloadFits = (payload: string): void =>
  assertPayloadFits(
    payload,
    FAMILY_PAYLOAD_BUDGET_BYTES.cardano,
    `Cardano CIP-20 metadata holds up to ${FAMILY_PAYLOAD_BUDGET_BYTES.cardano} bytes within transaction limits`
  );

export const anchorCIDWithMetadata = async (
  signer: CardanoAnchorSigner,
  { chainId, ...payload }: CardanoAnchorParams
): Promise<{ txHash: string; payload: string }> => {
  resolveCardanoChain(chainId);
  const serialized = buildFileAnchorPayload(payload);
  assertCardanoPayloadFits(serialized);
  const { txHash } = await signer.submitMetadataTransaction(splitForMetadata(serialized));
  return { txHash, payload: serialized };
};

export interface CardanoChunkedAnchorParams {
  /** A `cardano:*` chain id, e.g. "cardano:mainnet". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is embedded (base64) when `includeData` asks
   * for on-chain storage. */
  chunks: AnchorChunk[];
  /** Embed chunk bytes in the payloads (on-chain storage). Defaults to the
   * chain's `embedsChunkData` flag; mind the per-transaction byte budget. */
  includeData?: boolean;
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  /**
   * Skip payloads a previous attempt of the identical request already
   * landed — pass the `failedIndex` of the PartialAnchorError it threw.
   * The receipt covers only the transactions this run sends.
   */
  resumeFrom?: number;
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
  { chainId, fileCid, chunks, sha256, uri, includeData, resumeFrom, onProgress }: CardanoChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveCardanoChain(chainId);

  const payloads = buildChunkedAnchorPayloads({
    fileCid,
    chunks,
    sha256,
    uri,
    includeData: includeData ?? chain.embedsChunkData ?? false,
  });
  for (const payload of payloads) assertCardanoPayloadFits(payload);

  // No blockNumber in the receipt — CIP-30 wallets return only the hash.
  return runSequentialChunkedAnchor({
    chainId: chain.id,
    payloads,
    chunksTotal: chunks.length,
    submitter: signer.address,
    send: (payload) => signer.submitMetadataTransaction(splitForMetadata(payload)),
    resumeFrom,
    onProgress,
  });
};
