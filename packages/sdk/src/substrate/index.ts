import type { ApiPromise } from "@polkadot/api";
import type { AddressOrPair, Signer, SubmittableExtrinsic } from "@polkadot/api/types";
import {
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  parseAnchorPayload,
  type AnchorChunk,
  type AnchorProgressHandler,
  type BuildFileAnchorParams,
  type ChunkedAnchorReceipt,
  type FileAnchorPayload,
} from "../anchor";
import { getChain, type ChainConfig } from "../chains";
import type { ChainId } from "../types";

/**
 * Substrate client. Anchors are `system.remarkWithEvent` extrinsics carrying
 * the versioned JSON payloads from `../anchor`, so any indexer can find and
 * parse them without bespoke chain state. Anchoring a folder is identical to
 * anchoring a file — pass the CID of the folder's DAG root.
 */

/** @deprecated Use `FileAnchorPayload` from the core entry. */
export type AnchorRemark = FileAnchorPayload;

export type BuildAnchorRemarkParams = BuildFileAnchorParams;

/** Serialize the file-level anchor payload stored in the remark. */
export const buildAnchorRemark = (params: BuildAnchorRemarkParams): string =>
  buildFileAnchorPayload(params);

/** Parse a remark back into a file-level anchor; null if it isn't one. */
export const parseAnchorRemark = (remark: string): FileAnchorPayload | null => {
  const parsed = parseAnchorPayload(remark);
  return parsed?.op === "anchor" ? parsed : null;
};

/**
 * Resolve a `substrate:*` chain that anchors via remarks, or throw with a
 * message that says exactly what's missing.
 */
export const resolveSubstrateChain = (chainId: ChainId): ChainConfig => {
  const chain = getChain(chainId);
  if (!chain) throw new Error(`Unknown chain "${chainId}".`);
  if (chain.family !== "substrate") {
    throw new Error(`Chain "${chainId}" is not a Substrate chain; use the ${chain.family} client instead.`);
  }
  if (chain.palletContract !== "system.remarkWithEvent") {
    throw new Error(`Chain "${chainId}" does not support remark anchoring.`);
  }
  return chain;
};

export interface SubstrateAnchorParams extends BuildFileAnchorParams {
  /** A `substrate:*` chain id, e.g. "substrate:autonomys-mainnet". */
  chainId: ChainId;
  /** SS58 address (browser signer flows) or a keyring pair (server flows). */
  address: AddressOrPair;
  /** Injected signer (e.g. from a browser extension); omit for a keyring pair. */
  signer?: Signer;
}

export interface SubstrateAnchorReceipt {
  txHash: string;
  blockHash: string;
  remark: string;
}

/** Sign, send, and resolve when the extrinsic lands in a block. */
const signAndSendInBlock = (
  api: ApiPromise,
  tx: SubmittableExtrinsic<"promise">,
  address: AddressOrPair,
  signer?: Signer,
): Promise<{ txHash: string; blockHash: string }> =>
  new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    const settle = (fn: () => void) => {
      unsubscribe?.();
      fn();
    };
    tx.signAndSend(
      address,
      signer ? { nonce: -1, signer } : { nonce: -1 },
      ({ status, dispatchError, txHash }) => {
        if (dispatchError) {
          if (dispatchError.isModule) {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            settle(() =>
              reject(new Error(`${decoded.section}.${decoded.name}: ${decoded.docs.join(" ")}`))
            );
          } else {
            settle(() => reject(new Error(dispatchError.toString())));
          }
          return;
        }
        if (status.isInBlock) {
          settle(() =>
            resolve({ txHash: txHash.toHex(), blockHash: status.asInBlock.toHex() })
          );
        }
      }
    )
      .then((unsub) => {
        unsubscribe = unsub;
      })
      .catch(reject);
  });

/**
 * Anchor a CID with `system.remarkWithEvent`, resolving once the extrinsic
 * is included in a block. The caller owns the `api` connection lifecycle.
 */
export const anchorCIDWithRemark = async (
  api: ApiPromise,
  { chainId, address, signer, ...payload }: SubstrateAnchorParams
): Promise<SubstrateAnchorReceipt> => {
  resolveSubstrateChain(chainId);
  const remark = buildAnchorRemark(payload);
  const tx = api.tx.system.remarkWithEvent(remark);
  const { txHash, blockHash } = await signAndSendInBlock(api, tx, address, signer);
  return { txHash, blockHash, remark };
};

export interface SubstrateChunkedAnchorParams {
  /** A `substrate:*` chain id, e.g. "substrate:autonomys-mainnet". */
  chainId: ChainId;
  /** SS58 address (browser signer flows) or a keyring pair (server flows). */
  address: AddressOrPair;
  /** Injected signer (e.g. from a browser extension); omit for a keyring pair. */
  signer?: Signer;
  /** CIDv1 of the whole file. */
  fileCid: string;
  chunks: AnchorChunk[];
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  /** Embed chunk bytes in the remarks (default true — Substrate stores data). */
  includeData?: boolean;
  /** Split into multiple batch extrinsics past this many payload bytes. */
  maxBatchBytes?: number;
  onProgress?: AnchorProgressHandler;
}

/** Base64 grows 64KB chunks to ~87KB of JSON, so ~1MB keeps each batch a
 * comfortable fraction of a block while bounding signature prompts. */
const DEFAULT_MAX_BATCH_BYTES = 1024 * 1024;

/**
 * Anchor every chunk plus the file-level anchor as `system.remarkWithEvent`
 * extrinsics wrapped in `utility.batchAll` (atomic per batch). Batches are
 * split by payload size; each batch is one signature. Resolves after the
 * last batch is in a block.
 */
export const anchorChunkedFile = async (
  api: ApiPromise,
  {
    chainId,
    address,
    signer,
    fileCid,
    chunks,
    sha256,
    uri,
    includeData = true,
    maxBatchBytes = DEFAULT_MAX_BATCH_BYTES,
    onProgress,
  }: SubstrateChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveSubstrateChain(chainId);
  const total = chunks.length;

  // Chunk remarks first, file-level anchor last — indexers see the file
  // anchor only once every chunk it references is already on-chain.
  const remarks = chunks.map((chunk) =>
    buildChunkAnchorPayload({ fileCid, chunk, total, includeData })
  );
  remarks.push(buildFileAnchorPayload({ cid: fileCid, sha256, uri }));

  // Greedy size-budgeted batches; `chunksPer[i]` counts chunk (not file)
  // remarks in batch i so progress can be reported per accepted batch.
  const batches: string[][] = [];
  let current: string[] = [];
  let currentBytes = 0;
  for (const remark of remarks) {
    if (current.length > 0 && currentBytes + remark.length > maxBatchBytes) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(remark);
    currentBytes += remark.length;
  }
  if (current.length > 0) batches.push(current);

  const submitter =
    typeof address === "string" ? address : (address as { address: string }).address;

  const txHashes: string[] = [];
  let lastBlockHash = "";
  let chunksAnchored = 0;

  for (const batch of batches) {
    onProgress?.({ stage: "signing", chunksAnchored, chunksTotal: total });
    const txs = batch.map((remark) => api.tx.system.remarkWithEvent(remark));
    const tx = txs.length === 1 ? txs[0] : api.tx.utility.batchAll(txs);
    const { txHash, blockHash } = await signAndSendInBlock(api, tx, address, signer);
    txHashes.push(txHash);
    lastBlockHash = blockHash;
    // The final remark of the final batch is the file anchor, not a chunk.
    chunksAnchored = Math.min(chunksAnchored + batch.length, total);
    onProgress?.({ stage: "confirming", chunksAnchored, chunksTotal: total, txHash });
  }

  let blockNumber: number | undefined;
  try {
    const header = await api.rpc.chain.getHeader(lastBlockHash);
    blockNumber = header.number.toNumber();
  } catch {
    // Explorer links still work from the tx hash alone.
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
    blockNumber,
    blockHash: lastBlockHash,
    submitter,
  };
};
