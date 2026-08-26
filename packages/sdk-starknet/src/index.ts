import {
  assertPayloadFits,
  batchByBytes,
  batchByCount,
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  ChainNotProvisionedError,
  FAMILY_PAYLOAD_BUDGET_BYTES,
  PartialAnchorError,
  resolveFamilyChain,
  utf8ByteLength,
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

/**
 * Total payload bytes per multicall transaction — conservative headroom
 * under the sequencer's calldata limits once ByteArray encoding (one felt
 * per 31 bytes plus framing) is counted.
 */
export const DEFAULT_MAX_BYTES_PER_TX = 30_000;

const assertStarknetPayloadFits = (payload: string): void =>
  assertPayloadFits(
    payload,
    FAMILY_PAYLOAD_BUDGET_BYTES.starknet,
    `Starknet event data holds up to ${FAMILY_PAYLOAD_BUDGET_BYTES.starknet} bytes (the per-event data cap is ~300 felts, ~9 KB packed)`
  );

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
  assertStarknetPayloadFits(serialized);
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
  /** Override the total payload bytes allowed per multicall transaction. */
  maxBytesPerTx?: number;
  /**
   * Skip batches a previous attempt of the identical request already
   * landed — pass the `failedIndex` of the PartialAnchorError it threw.
   * Batching is deterministic, so the index stays valid while the request
   * inputs (chunks, budgets, flags) are unchanged. The receipt covers only
   * the transactions this run sends.
   */
  resumeFrom?: number;
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
    maxBytesPerTx = DEFAULT_MAX_BYTES_PER_TX,
    resumeFrom,
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
  for (const call of calls) assertStarknetPayloadFits(call.payload);

  // Bound each multicall by total payload bytes first, then by call count.
  const batches = batchByBytes(calls, maxBytesPerTx, (call) =>
    utf8ByteLength(call.payload)
  ).flatMap((batch) => batchByCount(batch, maxCallsPerTx));

  const txHashes: string[] = [];
  let lastBlockNumber: number | undefined;
  let chunksAnchored = 0;
  // Clamp so a stale resume index can never skip the final batch (it
  // carries the file-level anchor).
  const startAt = Math.min(Math.max(Math.floor(resumeFrom ?? 0), 0), batches.length - 1);

  for (const [batchIndex, batch] of batches.entries()) {
    if (batchIndex < startAt) {
      // Landed in a previous attempt — still counts toward progress.
      chunksAnchored = Math.min(chunksAnchored + batch.length, total);
      continue;
    }
    onProgress?.({ stage: "signing", chunksAnchored, chunksTotal: total });
    let result: { transactionHash: string; blockNumber?: number };
    try {
      result = await signer.executeAnchorCalls(chain.registryContract, batch);
    } catch (error) {
      // Don't discard the transactions that already landed. `failedIndex`
      // stays absolute so it can seed the next attempt's `resumeFrom`.
      throw new PartialAnchorError(txHashes, txHashes.length, batchIndex, error);
    }
    const { transactionHash, blockNumber } = result;
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
