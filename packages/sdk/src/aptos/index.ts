import {
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  ChainNotProvisionedError,
  type AnchorChunk,
  type AnchorProgressHandler,
  type BuildFileAnchorParams,
  type ChunkedAnchorReceipt,
} from "../anchor";
import { getChain, type ChainConfig } from "../chains";
import type { ChainId } from "../types";

/**
 * Aptos client. Anchors call `<moduleAddress>::file_registry::anchor_cid`
 * with the versioned JSON payloads from `../anchor`. Built against the
 * wallet-standard provider surface (Petra, Martian), so it needs no Aptos
 * SDK dependency; it stays behind `ChainNotProvisionedError` until a module
 * address lands in the chain registry.
 */

/** Module function every anchor calls, namespaced under `moduleAddress`. */
export const ANCHOR_FUNCTION = "file_registry::anchor_cid" as const;

export interface AptosEntryFunctionPayload {
  type: "entry_function_payload";
  function: string;
  type_arguments: string[];
  arguments: unknown[];
}

/**
 * The wallet surface the client needs — matched by Petra and Martian's
 * injected providers and by aptos-wallet-adapter.
 */
export interface AptosAnchorSigner {
  address: string;
  signAndSubmitTransaction(payload: AptosEntryFunctionPayload): Promise<{ hash: string }>;
}

/**
 * Resolve an `aptos:*` chain with a deployed anchoring module, or throw with
 * a message that says exactly what's missing.
 */
export const resolveAptosChain = (
  chainId: ChainId
): ChainConfig & { moduleAddress: string } => {
  const chain = getChain(chainId);
  if (!chain) throw new Error(`Unknown chain "${chainId}".`);
  if (chain.family !== "aptos") {
    throw new Error(`Chain "${chainId}" is not an Aptos chain; use the ${chain.family} client instead.`);
  }
  if (!chain.moduleAddress) {
    throw new ChainNotProvisionedError(chainId, "the anchoring Move module is not deployed yet.");
  }
  return chain as ChainConfig & { moduleAddress: string };
};

const anchorPayload = (moduleAddress: string, cid: string, payload: string): AptosEntryFunctionPayload => ({
  type: "entry_function_payload",
  function: `${moduleAddress}::${ANCHOR_FUNCTION}`,
  type_arguments: [],
  arguments: [cid, payload],
});

export interface AptosAnchorParams extends BuildFileAnchorParams {
  /** An `aptos:*` chain id, e.g. "aptos:mainnet". */
  chainId: ChainId;
}

/** Anchor a single CID as one module call. */
export const anchorCID = async (
  signer: AptosAnchorSigner,
  { chainId, ...payload }: AptosAnchorParams
): Promise<{ hash: string; payload: string }> => {
  const chain = resolveAptosChain(chainId);
  const serialized = buildFileAnchorPayload(payload);
  const { hash } = await signer.signAndSubmitTransaction(
    anchorPayload(chain.moduleAddress, payload.cid, serialized)
  );
  return { hash, payload: serialized };
};

export interface AptosChunkedAnchorParams {
  /** An `aptos:*` chain id, e.g. "aptos:mainnet". */
  chainId: ChainId;
  /** CIDv1 of the whole file. */
  fileCid: string;
  /** Chunks to anchor; `data` is ignored — the module stores CIDs, not bytes. */
  chunks: AnchorChunk[];
  /** Optional SHA-256 (hex) of the raw content, on the file-level anchor. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer, on the file-level anchor. */
  uri?: string;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk, then the file CID, as sequential module calls. One
 * wallet confirmation per transaction; the last one carries the file anchor.
 */
export const anchorChunkedFile = async (
  signer: AptosAnchorSigner,
  { chainId, fileCid, chunks, sha256, uri, onProgress }: AptosChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveAptosChain(chainId);
  const total = chunks.length;
  const txHashes: string[] = [];

  for (const chunk of chunks) {
    onProgress?.({ stage: "signing", chunksAnchored: chunk.index, chunksTotal: total });
    const payload = buildChunkAnchorPayload({ fileCid, chunk, total });
    const { hash } = await signer.signAndSubmitTransaction(
      anchorPayload(chain.moduleAddress, chunk.cid, payload)
    );
    txHashes.push(hash);
    onProgress?.({
      stage: "submitting",
      chunksAnchored: chunk.index + 1,
      chunksTotal: total,
      txHash: hash,
    });
  }

  onProgress?.({ stage: "signing", chunksAnchored: total, chunksTotal: total });
  const filePayload = buildFileAnchorPayload({ cid: fileCid, sha256, uri });
  const { hash: fileTxHash } = await signer.signAndSubmitTransaction(
    anchorPayload(chain.moduleAddress, fileCid, filePayload)
  );
  txHashes.push(fileTxHash);
  onProgress?.({ stage: "confirmed", chunksAnchored: total, chunksTotal: total, txHash: fileTxHash });

  return {
    chainId: chain.id,
    txHashes,
    txHash: fileTxHash,
    submitter: signer.address,
  };
};
