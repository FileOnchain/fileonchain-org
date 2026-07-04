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
 * TRON client. TRON is its own family (base58 T-addresses, resource model)
 * — not EVM. MVP anchors ride a transaction's data/memo field — one
 * versioned JSON payload from `@fileonchain/utils` per transaction, so
 * `parseAnchorPayload` reads them straight off confirmed txs; chains
 * provision by flipping `memoAnchoring` in the registry. A TVM deployment
 * of the Solidity FileRegistry can later land in `moduleAddress`. Built
 * against a minimal signer surface so the SDK stays dependency-free — the
 * caller adapts TronLink's injected tronWeb (browser) or TronGrid REST
 * (server) to it.
 */

/**
 * TRON tx data has no tight protocol cap like Cosmos memos; 2KB keeps
 * bandwidth costs sane.
 */
export const DEFAULT_MAX_MEMO_BYTES = 2048;

/**
 * The transport surface the client needs. Implementations send one minimal
 * transaction (conventionally a self-send of one base unit) carrying `memo`,
 * and resolve once it is in a block.
 */
export interface TronAnchorSigner {
  /** Base58 T-address paying for and signing the transactions. */
  address: string;
  sendMemoTransaction(memo: string): Promise<{ txHash: string; blockNumber?: number }>;
}

/** Resolve a provisioned `tron:*` chain, or throw naming what's missing. */
export const resolveTronChain = (chainId: ChainId): ChainConfig =>
  resolveFamilyChain(chainId, {
    family: "tron",
    familyLabel: "a TRON chain",
    assertProvisioned: (chain) => {
      if (!chain.memoAnchoring && !chain.moduleAddress) {
        throw new ChainNotProvisionedError(chainId, "memo anchoring is not enabled for this chain yet.");
      }
    },
  });

const assertMemoFits = (memo: string, maxBytes: number): void =>
  assertPayloadFits(memo, maxBytes, `the chain accepts memos up to ${maxBytes} bytes`);

export interface TronAnchorParams extends BuildFileAnchorParams {
  /** A `tron:*` chain id, e.g. "tron:mainnet". */
  chainId: ChainId;
  /** Override the per-chain memo byte budget. */
  maxMemoBytes?: number;
}

/** Anchor a single CID as one memo transaction. */
export const anchorCIDWithMemo = async (
  signer: TronAnchorSigner,
  { chainId, maxMemoBytes = DEFAULT_MAX_MEMO_BYTES, ...payload }: TronAnchorParams
): Promise<{ txHash: string; blockNumber?: number; memo: string }> => {
  resolveTronChain(chainId);
  const memo = buildFileAnchorPayload(payload);
  assertMemoFits(memo, maxMemoBytes);
  const { txHash, blockNumber } = await signer.sendMemoTransaction(memo);
  return { txHash, blockNumber, memo };
};

export interface TronChunkedAnchorParams {
  /** A `tron:*` chain id, e.g. "tron:mainnet". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is ignored — memos hold CIDs, not bytes. */
  chunks: AnchorChunk[];
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
  signer: TronAnchorSigner,
  {
    chainId,
    fileCid,
    chunks,
    sha256,
    uri,
    maxMemoBytes = DEFAULT_MAX_MEMO_BYTES,
    onProgress,
  }: TronChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveTronChain(chainId);

  const memos = buildChunkedAnchorPayloads({ fileCid, chunks, sha256, uri });
  for (const memo of memos) assertMemoFits(memo, maxMemoBytes);

  return runSequentialChunkedAnchor({
    chainId: chain.id,
    payloads: memos,
    chunksTotal: chunks.length,
    submitter: signer.address,
    send: (memo) => signer.sendMemoTransaction(memo),
    onProgress,
  });
};
