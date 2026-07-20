import {
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  ChainNotProvisionedError,
  resolveFamilyChain,
  type AnchorChunk,
  type AnchorProgressHandler,
  type BuildFileAnchorParams,
  type ChainConfig,
  type ChainId,
  type ChunkedAnchorReceipt,
} from "@fileonchain/utils";

/**
 * NEAR client. Anchors call the free event-only `anchor_cid(cid, payload)`
 * on the WASM registry contract (contracts/near), whose **account id** lives
 * in `moduleAddress` on the chain entry (e.g. "registry.fileonchain.near"),
 * writing the versioned JSON payloads from `@fileonchain/utils` — free
 * beyond gas. Built against a minimal signer surface so the SDK stays
 * dependency-free — the caller adapts near-api-js (server) or an injected
 * browser wallet to it.
 */

/** Contract method every anchor calls on the registry account. */
export const ANCHOR_METHOD = "anchor_cid" as const;

/**
 * The transport surface the client needs. Implementations invoke
 * `anchor_cid` on `contractId` with the given arguments, and resolve once
 * the transaction is final.
 */
export interface NearAnchorSigner {
  /** NEAR account id paying for and signing the transactions. */
  accountId: string;
  callAnchor(contractId: string, cid: string, payload: string): Promise<{ txHash: string; blockHeight?: number }>;
}

/**
 * Resolve a `near:*` chain with a deployed registry contract, or throw with
 * a message that says exactly what's missing.
 */
export const resolveNearChain = (
  chainId: ChainId
): ChainConfig & { moduleAddress: string } =>
  resolveFamilyChain(chainId, {
    family: "near",
    familyLabel: "a NEAR chain",
    assertProvisioned: (chain) => {
      if (!chain.moduleAddress) {
        throw new ChainNotProvisionedError(chainId, "the registry contract account is not deployed yet.");
      }
    },
  }) as ChainConfig & { moduleAddress: string };

export interface NearAnchorParams extends BuildFileAnchorParams {
  /** A `near:*` chain id, e.g. "near:mainnet". */
  chainId: ChainId;
}

/**
 * Anchor a single file-level CID as a plain `anchor_cid` event on the
 * registry contract.
 */
export const anchorCID = async (
  signer: NearAnchorSigner,
  { chainId, platformId = "1", ...payload }: NearAnchorParams
): Promise<{ txHash: string; payload: string }> => {
  const chain = resolveNearChain(chainId);
  const serialized = buildFileAnchorPayload({ ...payload, platformId });
  const { txHash } = await signer.callAnchor(chain.moduleAddress, payload.cid, serialized);
  return { txHash, payload: serialized };
};

export interface NearChunkedAnchorParams {
  /** A `near:*` chain id, e.g. "near:mainnet". */
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
  /** Originating platform id (payload attribution); defaults to FileOnChain's platform 1. */
  platformId?: string;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk as free `anchor_cid` contract calls, then the file CID
 * as one more. One wallet confirmation per transaction; the last one
 * carries the file anchor.
 */
export const anchorChunkedFile = async (
  signer: NearAnchorSigner,
  { chainId, fileCid, chunks, sha256, uri, includeData, platformId = "1", onProgress }: NearChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveNearChain(chainId);
  const embedData = includeData ?? chain.embedsChunkData ?? false;
  const total = chunks.length;
  const txHashes: string[] = [];
  let lastBlockHeight: number | undefined;

  for (const chunk of chunks) {
    onProgress?.({ stage: "signing", chunksAnchored: chunk.index, chunksTotal: total });
    const payload = buildChunkAnchorPayload({ fileCid, chunk, total, includeData: embedData });
    const { txHash, blockHeight } = await signer.callAnchor(chain.moduleAddress, chunk.cid, payload);
    txHashes.push(txHash);
    lastBlockHeight = blockHeight ?? lastBlockHeight;
    onProgress?.({
      stage: "submitting",
      chunksAnchored: chunk.index + 1,
      chunksTotal: total,
      txHash,
    });
  }

  onProgress?.({ stage: "signing", chunksAnchored: total, chunksTotal: total });
  const filePayload = buildFileAnchorPayload({ cid: fileCid, sha256, uri, platformId });
  const fileResult = await signer.callAnchor(chain.moduleAddress, fileCid, filePayload);
  const fileTxHash = fileResult.txHash;
  lastBlockHeight = fileResult.blockHeight ?? lastBlockHeight;
  txHashes.push(fileTxHash);
  onProgress?.({ stage: "confirmed", chunksAnchored: total, chunksTotal: total, txHash: fileTxHash });

  return {
    chainId: chain.id,
    txHashes,
    txHash: fileTxHash,
    blockNumber: lastBlockHeight,
    submitter: signer.accountId,
  };
};
