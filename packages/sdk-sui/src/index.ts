import {
  batchByCount,
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
 * Sui client. Anchors call `<moduleAddress>::file_registry::anchor_cid(cid,
 * payload)` (contracts/sui) with the versioned JSON payloads from
 * `@fileonchain/utils` — free beyond gas. Sui programmable transaction
 * blocks let many move calls share one transaction and one wallet approval,
 * so the client batches all chunk anchors plus the file anchor into as few
 * PTBs as possible. Built against a minimal signer surface so the SDK stays
 * dependency-free — the caller adapts @mysten/sui (server) or a
 * wallet-standard wallet (browser).
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
): ChainConfig & { moduleAddress: string } =>
  resolveFamilyChain(chainId, {
    family: "sui",
    familyLabel: "a Sui chain",
    assertProvisioned: (chain) => {
      if (!chain.moduleAddress) {
        throw new ChainNotProvisionedError(chainId, "the anchoring Move module is not deployed yet.");
      }
    },
  }) as ChainConfig & { moduleAddress: string };

/**
 * Sui caps PTB commands at 1024; 128 keeps transactions comfortably under
 * gas and size budgets.
 */
export const DEFAULT_MAX_CALLS_PER_TX = 128;

export interface SuiAnchorParams extends BuildFileAnchorParams {
  /** A `sui:*` chain id, e.g. "sui:mainnet". */
  chainId: ChainId;
}

/**
 * Anchor a single file-level CID as a plain one-call `anchor_cid` PTB.
 */
export const anchorCID = async (
  signer: SuiAnchorSigner,
  { chainId, platformId = "1", ...payload }: SuiAnchorParams
): Promise<{ digest: string; payload: string }> => {
  const chain = resolveSuiChain(chainId);
  const serialized = buildFileAnchorPayload({ ...payload, platformId });
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
  /** Override how many move calls share one PTB. */
  maxCallsPerTx?: number;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk as free `file_registry::anchor_cid` calls batched into
 * as few PTBs as possible, with the file-level anchor riding the last batch
 * — chunk anchors first, file anchor last, so indexers see the file anchor
 * only after every chunk.
 */
export const anchorChunkedFile = async (
  signer: SuiAnchorSigner,
  {
    chainId,
    fileCid,
    chunks,
    sha256,
    uri,
    includeData,
    platformId = "1",
    maxCallsPerTx = DEFAULT_MAX_CALLS_PER_TX,
    onProgress,
  }: SuiChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveSuiChain(chainId);
  const embedData = includeData ?? chain.embedsChunkData ?? false;
  const target = `${chain.moduleAddress}::${ANCHOR_FUNCTION}`;
  const total = chunks.length;

  const calls: SuiAnchorCall[] = chunks.map((chunk) => ({
    cid: chunk.cid,
    payload: buildChunkAnchorPayload({ fileCid, chunk, total, includeData: embedData }),
  }));
  // File-level anchor rides the last chunk batch.
  calls.push({
    cid: fileCid,
    payload: buildFileAnchorPayload({ cid: fileCid, sha256, uri, platformId }),
  });

  const digests: string[] = [];
  let lastCheckpoint: number | undefined;
  let chunksAnchored = 0;

  for (const batch of batchByCount(calls, maxCallsPerTx)) {
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
