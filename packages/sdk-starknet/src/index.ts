import {
  batchByCount,
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  ChainNotProvisionedError,
  resolveFamilyChain,
  ZERO_ADDRESS,
  type AnchorChunk,
  type AnchorProgressHandler,
  type BuildFileAnchorParams,
  type ChainConfig,
  type ChainId,
  type ChunkedAnchorReceipt,
} from "@fileonchain/utils";

/**
 * Starknet client. Anchors call `anchor_cid(cid: ByteArray, payload: ByteArray)`
 * on the Cairo FileRegistry (contracts/starknet), whose address lives in
 * `registryContract` on the chain entry, writing the versioned JSON payloads
 * from `@fileonchain/utils` — free beyond gas. Starknet accounts execute
 * multicalls natively, so all chunk anchors plus the file anchor share as
 * few transactions (and wallet approvals) as possible. Built against a
 * minimal signer surface so the SDK stays dependency-free — the caller
 * adapts starknet.js (server) or an injected Argent/Braavos account
 * (browser), which also handle ByteArray calldata encoding.
 */

/** Contract entrypoint every anchor calls on the FileRegistry. */
export const ANCHOR_ENTRYPOINT = "anchor_cid" as const;

/** One `anchor_cid` call — the signer encodes both strings as ByteArrays. */
export interface StarknetAnchorCall {
  cid: string;
  payload: string;
}

/**
 * The account surface the client needs. Implementations execute the calls as
 * one multicall transaction against `registryContract` and resolve once it
 * is accepted.
 */
export interface StarknetAnchorSigner {
  /** Account contract address paying for and signing the transactions. */
  address: string;
  executeAnchorCalls(
    registryContract: string,
    calls: StarknetAnchorCall[]
  ): Promise<{ transactionHash: string; blockNumber?: number }>;
}

/**
 * Resolve a `starknet:*` chain with a deployed FileRegistry, or throw with a
 * message that says exactly what's missing.
 */
export const resolveStarknetChain = (
  chainId: ChainId
): ChainConfig & { registryContract: `0x${string}` } =>
  resolveFamilyChain(chainId, {
    family: "starknet",
    familyLabel: "a Starknet chain",
    assertProvisioned: (chain) => {
      if (!chain.registryContract || chain.registryContract === ZERO_ADDRESS) {
        throw new ChainNotProvisionedError(chainId, "the Cairo registry contract is not deployed yet.");
      }
    },
  }) as ChainConfig & { registryContract: `0x${string}` };

/**
 * Calls per multicall transaction — conservative enough to stay under the
 * sequencer's calldata and Cairo step limits with room for ByteArray
 * encoding overhead.
 */
export const DEFAULT_MAX_CALLS_PER_TX = 64;

export interface StarknetAnchorParams extends BuildFileAnchorParams {
  /** A `starknet:*` chain id, e.g. "starknet:mainnet". */
  chainId: ChainId;
}

/**
 * Anchor a single file-level CID as a plain `anchor_cid` event on the
 * FileRegistry.
 */
export const anchorCID = async (
  signer: StarknetAnchorSigner,
  { chainId, platformId = "1", ...payload }: StarknetAnchorParams
): Promise<{ transactionHash: string; payload: string }> => {
  const chain = resolveStarknetChain(chainId);
  const serialized = buildFileAnchorPayload({ ...payload, platformId });
  const { transactionHash } = await signer.executeAnchorCalls(chain.registryContract, [
    { cid: payload.cid, payload: serialized },
  ]);
  return { transactionHash, payload: serialized };
};

export interface StarknetChunkedAnchorParams {
  /** A `starknet:*` chain id, e.g. "starknet:mainnet". */
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
  /** Override the calls-per-multicall budget. */
  maxCallsPerTx?: number;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk as free `anchor_cid` multicalls of up to
 * `maxCallsPerTx` calls each, with the file-level anchor riding the last
 * batch — chunk anchors first, file anchor last, so indexers see the file
 * anchor only after every chunk.
 */
export const anchorChunkedFile = async (
  signer: StarknetAnchorSigner,
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
  }: StarknetChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveStarknetChain(chainId);
  const embedData = includeData ?? chain.embedsChunkData ?? false;
  const total = chunks.length;

  // Chunk anchors first, file anchor last — indexers see the file anchor
  // only after every chunk.
  const calls: StarknetAnchorCall[] = chunks.map((chunk) => ({
    cid: chunk.cid,
    payload: buildChunkAnchorPayload({ fileCid, chunk, total, includeData: embedData }),
  }));
  calls.push({
    cid: fileCid,
    payload: buildFileAnchorPayload({ cid: fileCid, sha256, uri, platformId }),
  });

  const txHashes: string[] = [];
  let lastBlockNumber: number | undefined;
  let chunksAnchored = 0;

  for (const batch of batchByCount(calls, maxCallsPerTx)) {
    onProgress?.({ stage: "signing", chunksAnchored, chunksTotal: total });
    const { transactionHash, blockNumber } = await signer.executeAnchorCalls(
      chain.registryContract,
      batch
    );
    txHashes.push(transactionHash);
    lastBlockNumber = blockNumber ?? lastBlockNumber;
    // The trailing file-level call is not a chunk, so cap the count at the total.
    chunksAnchored = Math.min(chunksAnchored + batch.length, total);
    onProgress?.({
      stage: "confirming",
      chunksAnchored,
      chunksTotal: total,
      txHash: transactionHash,
    });
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
    blockNumber: lastBlockNumber,
    submitter: signer.address,
  };
};
