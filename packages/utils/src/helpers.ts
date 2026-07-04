import {
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  type AnchorChunk,
  type AnchorProgressHandler,
  type ChunkedAnchorReceipt,
} from "./anchor";
import { getChain, type ChainConfig } from "./chains";
import type { ChainFamily, ChainId } from "./types";

/**
 * Shared orchestration helpers behind every family client. Payload *format*
 * lives in `./anchor`; this module owns the recurring machinery around it —
 * chain resolution, size pre-flight, batching, and the sequential
 * payload-per-transaction anchor loop — so each family package only supplies
 * its transport.
 */

export interface ResolveFamilyChainOptions {
  family: ChainFamily;
  /** Label with its article for the wrong-family error, e.g. "an EVM chain". */
  familyLabel: string;
  /**
   * Throw when the chain isn't ready to anchor for real — typically a
   * `ChainNotProvisionedError` naming exactly what's missing. Omit for
   * families that are always provisioned (Solana's memo program).
   */
  assertProvisioned?: (chain: ChainConfig) => void;
}

/**
 * The guard every `resolve<Family>Chain` performs: the chain exists, belongs
 * to the family, and is provisioned. Families keep their own exported
 * wrappers so error messages stay chain-specific.
 */
export const resolveFamilyChain = (
  chainId: ChainId,
  { family, familyLabel, assertProvisioned }: ResolveFamilyChainOptions
): ChainConfig => {
  const chain = getChain(chainId);
  if (!chain) throw new Error(`Unknown chain "${chainId}".`);
  if (chain.family !== family) {
    throw new Error(`Chain "${chainId}" is not ${familyLabel}; use the ${chain.family} client instead.`);
  }
  assertProvisioned?.(chain);
  return chain;
};

/** UTF-8 byte length of a string — what memo/comment/message caps count. */
export const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).length;

/**
 * Reject a payload that exceeds a chain's transport cap before the user is
 * asked to sign anything. `limitDescription` finishes the sentence
 * "Anchor payload is N bytes but …", e.g.
 * "the chain accepts memos up to 256 bytes".
 */
export const assertPayloadFits = (
  payload: string,
  maxBytes: number,
  limitDescription: string
): void => {
  const bytes = utf8ByteLength(payload);
  if (bytes > maxBytes) {
    throw new Error(`Anchor payload is ${bytes} bytes but ${limitDescription}.`);
  }
};

export interface BuildChunkedAnchorPayloadsParams {
  /** CIDv1 of the whole file. */
  fileCid: string;
  chunks: readonly AnchorChunk[];
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  /** Embed chunk bytes (base64) in the chunk payloads. Substrate only. */
  includeData?: boolean;
}

/**
 * Serialize a chunked anchor as ordered payloads: every chunk first, the
 * file-level anchor last — indexers must see the file anchor only after
 * every chunk it references is already on-chain.
 */
export const buildChunkedAnchorPayloads = ({
  fileCid,
  chunks,
  sha256,
  uri,
  includeData,
}: BuildChunkedAnchorPayloadsParams): string[] => {
  const total = chunks.length;
  const payloads = chunks.map((chunk) =>
    buildChunkAnchorPayload({ fileCid, chunk, total, includeData })
  );
  payloads.push(buildFileAnchorPayload({ cid: fileCid, sha256, uri }));
  return payloads;
};

/**
 * Greedy size-budgeted batching: start a new batch whenever adding the next
 * item would push the running total past `maxBytes`. An oversized single
 * item still gets its own batch — transports enforce their own hard caps.
 */
export const batchByBytes = <T>(
  items: readonly T[],
  maxBytes: number,
  sizeOf: (item: T) => number
): T[][] => {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;
  for (const item of items) {
    const size = sizeOf(item);
    if (current.length > 0 && currentBytes + size > maxBytes) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
};

/** Fixed-size batching: consecutive slices of up to `maxPerBatch` items. */
export const batchByCount = <T>(items: readonly T[], maxPerBatch: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += maxPerBatch) {
    batches.push(items.slice(i, i + maxPerBatch));
  }
  return batches;
};

/** What one sequential send resolves with; block info is best-effort. */
export interface SequentialSendResult {
  txHash: string;
  blockNumber?: number;
  blockHash?: string;
}

export interface RunSequentialChunkedAnchorParams {
  chainId: ChainId;
  /** Ordered payloads — chunk payloads first, the file-level anchor last. */
  payloads: readonly string[];
  /** Number of chunks (the trailing file-level payload is not a chunk). */
  chunksTotal: number;
  /** Address/account that signs, echoed into the receipt. */
  submitter: string;
  /** Send one payload as one transaction and resolve once it's accepted. */
  send: (payload: string, index: number) => Promise<SequentialSendResult>;
  onProgress?: AnchorProgressHandler;
}

/**
 * The payload-per-transaction anchor loop shared by the memo/metadata/
 * comment/message families: N chunk transactions, then the file anchor, with
 * uniform signing → confirming → confirmed progress. The last transaction is
 * the file-level anchor, so it becomes the receipt's headline `txHash`.
 */
export const runSequentialChunkedAnchor = async ({
  chainId,
  payloads,
  chunksTotal,
  submitter,
  send,
  onProgress,
}: RunSequentialChunkedAnchorParams): Promise<ChunkedAnchorReceipt> => {
  const txHashes: string[] = [];
  let lastBlockNumber: number | undefined;
  let lastBlockHash: string | undefined;
  let chunksAnchored = 0;

  for (const [index, payload] of payloads.entries()) {
    onProgress?.({ stage: "signing", chunksAnchored, chunksTotal });
    const { txHash, blockNumber, blockHash } = await send(payload, index);
    txHashes.push(txHash);
    lastBlockNumber = blockNumber ?? lastBlockNumber;
    lastBlockHash = blockHash ?? lastBlockHash;
    // The trailing file-level payload is not a chunk, so cap at the total.
    chunksAnchored = Math.min(chunksAnchored + 1, chunksTotal);
    onProgress?.({ stage: "confirming", chunksAnchored, chunksTotal, txHash });
  }

  const finalTxHash = txHashes[txHashes.length - 1];
  onProgress?.({
    stage: "confirmed",
    chunksAnchored: chunksTotal,
    chunksTotal,
    txHash: finalTxHash,
  });

  return {
    chainId,
    txHashes,
    txHash: finalTxHash,
    blockNumber: lastBlockNumber,
    blockHash: lastBlockHash,
    submitter,
  };
};
