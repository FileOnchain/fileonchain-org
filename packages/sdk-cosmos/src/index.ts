import {
  assertPayloadFits,
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
 * Cosmos client. Anchors ride the transaction memo field — one versioned
 * JSON payload from `@fileonchain/utils` per transaction, so
 * `parseAnchorPayload` reads them straight off confirmed txs. No module
 * deployment is needed; chains provision by flipping `memoAnchoring` in the
 * registry. Built against a minimal signer surface so the SDK stays
 * dependency-free — the caller adapts Keplr/Leap (browser) or @cosmjs
 * (server) to it.
 */

/**
 * Cosmos Hub's default `maxMemoCharacters`. Payloads that don't fit are
 * rejected up front — a memo over the limit fails at CheckTx anyway, after
 * the user has already signed.
 */
export const DEFAULT_MAX_MEMO_BYTES = 256;

/**
 * The transport surface the client needs. Implementations send one minimal
 * transaction (conventionally a self-send of one base unit) carrying `memo`,
 * and resolve once it is in a block.
 */
export interface CosmosAnchorSigner {
  /** Bech32 account address paying for and signing the transactions. */
  address: string;
  sendMemoTransaction(memo: string): Promise<{ txHash: string; height?: number }>;
}

/** Resolve a provisioned `cosmos:*` chain, or throw naming what's missing. */
export const resolveCosmosChain = (chainId: ChainId): ChainConfig =>
  resolveFamilyChain(chainId, {
    family: "cosmos",
    familyLabel: "a Cosmos chain",
    assertProvisioned: (chain) => {
      if (!chain.memoAnchoring && !chain.moduleAddress) {
        throw new ChainNotProvisionedError(chainId, "memo anchoring is not enabled for this chain yet.");
      }
    },
  });

const assertMemoFits = (memo: string, maxBytes: number): void =>
  assertPayloadFits(memo, maxBytes, `the chain accepts memos up to ${maxBytes} bytes`);

export interface CosmosAnchorParams extends BuildFileAnchorParams {
  /** A `cosmos:*` chain id, e.g. "cosmos:cosmoshub-4". */
  chainId: ChainId;
  /** Override the per-chain memo byte budget. */
  maxMemoBytes?: number;
}

/** Anchor a single CID as one memo transaction. */
export const anchorCIDWithMemo = async (
  signer: CosmosAnchorSigner,
  { chainId, maxMemoBytes = DEFAULT_MAX_MEMO_BYTES, ...payload }: CosmosAnchorParams
): Promise<{ txHash: string; height?: number; memo: string }> => {
  resolveCosmosChain(chainId);
  const memo = buildFileAnchorPayload(payload);
  assertMemoFits(memo, maxMemoBytes);
  const { txHash, height } = await signer.sendMemoTransaction(memo);
  return { txHash, height, memo };
};

export interface CosmosChunkedAnchorParams {
  /** A `cosmos:*` chain id, e.g. "cosmos:cosmoshub-4". */
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
  /** Override the per-chain memo byte budget. */
  maxMemoBytes?: number;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk, then the file CID, as sequential memo transactions —
 * memos hold exactly one payload each, so a chunked anchor is N+1 txs. One
 * wallet confirmation per transaction; the last one carries the file anchor.
 */
export const anchorChunkedFile = async (
  signer: CosmosAnchorSigner,
  {
    chainId,
    fileCid,
    chunks,
    sha256,
    uri,
    includeData,
    maxMemoBytes = DEFAULT_MAX_MEMO_BYTES,
    onProgress,
  }: CosmosChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveCosmosChain(chainId);

  const memos = buildChunkedAnchorPayloads({
    fileCid,
    chunks,
    sha256,
    uri,
    includeData: includeData ?? chain.embedsChunkData ?? false,
  });
  for (const memo of memos) assertMemoFits(memo, maxMemoBytes);

  return runSequentialChunkedAnchor({
    chainId: chain.id,
    payloads: memos,
    chunksTotal: chunks.length,
    submitter: signer.address,
    send: async (memo) => {
      const { txHash, height } = await signer.sendMemoTransaction(memo);
      return { txHash, blockNumber: height };
    },
    onProgress,
  });
};
