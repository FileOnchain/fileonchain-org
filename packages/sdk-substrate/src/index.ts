import type { ApiPromise } from "@polkadot/api";
import type { AddressOrPair, Signer, SubmittableExtrinsic } from "@polkadot/api/types";
import {
  batchByBytes,
  buildChunkedAnchorPayloads,
  buildFileAnchorPayload,
  parseAnchorPayload,
  PartialAnchorError,
  resolveFamilyChain,
  utf8ByteLength,
  type AnchorChunk,
  type AnchorProgressHandler,
  type BuildFileAnchorParams,
  type ChainConfig,
  type ChainId,
  type ChunkedAnchorReceipt,
  type FileAnchorPayload,
} from "@fileonchain/utils";

/**
 * Substrate client. Anchors are `system.remarkWithEvent` extrinsics carrying
 * the versioned JSON payloads from `@fileonchain/utils`, so any indexer can find and
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
export const resolveSubstrateChain = (chainId: ChainId): ChainConfig =>
  resolveFamilyChain(chainId, {
    family: "substrate",
    familyLabel: "a Substrate chain",
    // Deliberately a plain Error, not ChainNotProvisionedError: remark
    // anchoring is a chain capability, not a pending deployment of ours.
    assertProvisioned: (chain) => {
      if (chain.palletContract !== "system.remarkWithEvent") {
        throw new Error(`Chain "${chainId}" does not support remark anchoring.`);
      }
    },
  });

export interface SubstrateAnchorParams extends BuildFileAnchorParams {
  /** A `substrate:*` chain id, e.g. "substrate:autonomys-mainnet". */
  chainId: ChainId;
  /** SS58 address (browser signer flows) or a keyring pair (server flows). */
  address: AddressOrPair;
  /** Injected signer (e.g. from a browser extension); omit for a keyring pair. */
  signer?: Signer;
  /**
   * Resolve only once the extrinsic's block is finalized instead of at
   * `isInBlock` (the default). An in-block receipt can still be invalidated
   * by a reorg; opt in when the receipt feeds an evidence package.
   */
  waitForFinalization?: boolean;
}

export interface SubstrateAnchorReceipt {
  txHash: string;
  blockHash: string;
  remark: string;
}

/**
 * Sign, send, and resolve when the extrinsic lands in a block — or, with
 * `waitForFinalization`, only once the block is finalized (an in-block
 * extrinsic can still be dropped by a reorg).
 */
const signAndSendInBlock = (
  api: ApiPromise,
  tx: SubmittableExtrinsic<"promise">,
  address: AddressOrPair,
  signer?: Signer,
  waitForFinalization = false,
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
        if (waitForFinalization) {
          if (status.isFinalized) {
            settle(() =>
              resolve({ txHash: txHash.toHex(), blockHash: status.asFinalized.toHex() })
            );
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
  { chainId, address, signer, waitForFinalization, ...payload }: SubstrateAnchorParams
): Promise<SubstrateAnchorReceipt> => {
  resolveSubstrateChain(chainId);
  const remark = buildAnchorRemark(payload);
  const tx = api.tx.system.remarkWithEvent(remark);
  const { txHash, blockHash } = await signAndSendInBlock(
    api,
    tx,
    address,
    signer,
    waitForFinalization
  );
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
  /**
   * Embed chunk bytes in the remarks. Defaults to the chain's
   * `embedsChunkData` flag — true only on data-storage chains (Autonomys);
   * Asset Hub remarks stay CID-only.
   */
  includeData?: boolean;
  /** Split into multiple batch extrinsics past this many payload bytes. */
  maxBatchBytes?: number;
  /**
   * Resolve each batch only once its block is finalized instead of at
   * `isInBlock` (the default). An in-block receipt can still be invalidated
   * by a reorg; opt in when the receipt feeds an evidence package.
   */
  waitForFinalization?: boolean;
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
    includeData,
    maxBatchBytes = DEFAULT_MAX_BATCH_BYTES,
    waitForFinalization,
    onProgress,
  }: SubstrateChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveSubstrateChain(chainId);
  const embedData = includeData ?? chain.embedsChunkData ?? false;
  const total = chunks.length;

  const remarks = buildChunkedAnchorPayloads({
    fileCid,
    chunks,
    sha256,
    uri,
    includeData: embedData,
  });
  const batches = batchByBytes(remarks, maxBatchBytes, utf8ByteLength);

  const submitter =
    typeof address === "string" ? address : (address as { address: string }).address;

  const txHashes: string[] = [];
  let lastBlockHash = "";
  let chunksAnchored = 0;

  for (const [batchIndex, batch] of batches.entries()) {
    onProgress?.({ stage: "signing", chunksAnchored, chunksTotal: total });
    const txs = batch.map((remark) => api.tx.system.remarkWithEvent(remark));
    const tx = txs.length === 1 ? txs[0] : api.tx.utility.batchAll(txs);
    let result: { txHash: string; blockHash: string };
    try {
      result = await signAndSendInBlock(api, tx, address, signer, waitForFinalization);
    } catch (error) {
      // Don't discard the batches that already landed.
      throw new PartialAnchorError(txHashes, batchIndex, batchIndex, error);
    }
    const { txHash, blockHash } = result;
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
