import {
  assertPayloadFits,
  buildChunkAnchorPayload,
  buildFileAnchorPayload,
  ChainNotProvisionedError,
  FAMILY_PAYLOAD_BUDGET_BYTES,
  PartialAnchorError,
  resolveFamilyChain,
  type AnchorChunk,
  type AnchorProgressHandler,
  type BuildFileAnchorParams,
  type ChainConfig,
  type ChainId,
  type ChunkedAnchorReceipt,
} from "@fileonchain/utils";

/**
 * Aptos client. Anchors call the free event-only
 * `<moduleAddress>::file_registry::anchor_cid` with the versioned JSON
 * payloads from `@fileonchain/utils` — chunk anchors and the file-level
 * anchor alike, costing nothing beyond gas. Built against the
 * wallet-standard provider surface (Petra, Martian), so it needs no Aptos
 * SDK dependency.
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
): ChainConfig & { moduleAddress: string } =>
  resolveFamilyChain(chainId, {
    family: "aptos",
    familyLabel: "an Aptos chain",
    assertProvisioned: (chain) => {
      if (!chain.moduleAddress) {
        throw new ChainNotProvisionedError(chainId, "the anchoring Move module is not deployed yet.");
      }
    },
  }) as ChainConfig & { moduleAddress: string };

const assertAptosPayloadFits = (payload: string): void =>
  assertPayloadFits(
    payload,
    FAMILY_PAYLOAD_BUDGET_BYTES.aptos,
    `Aptos entry-function string args hold up to ${FAMILY_PAYLOAD_BUDGET_BYTES.aptos} bytes (within the 64 KiB transaction cap)`
  );

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

/**
 * Anchor a single file-level CID as a `file_registry::anchor_cid` event.
 */
export const anchorCID = async (
  signer: AptosAnchorSigner,
  { chainId, ...payload }: AptosAnchorParams
): Promise<{ hash: string; payload: string }> => {
  const chain = resolveAptosChain(chainId);
  const serialized = buildFileAnchorPayload(payload);
  assertAptosPayloadFits(serialized);
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
  /**
   * Skip chunk transactions a previous attempt of the identical request
   * already landed — pass the `failedIndex` of the PartialAnchorError it
   * threw (`chunks.length` means every chunk landed and only the file-level
   * anchor is left). The receipt covers only the transactions this run sends.
   */
  resumeFrom?: number;
  onProgress?: AnchorProgressHandler;
}

/**
 * Anchor every chunk as a free `file_registry::anchor_cid` call, then the
 * file CID as one more. One wallet confirmation per transaction; the last
 * one carries the file anchor.
 */
export const anchorChunkedFile = async (
  signer: AptosAnchorSigner,
  { chainId, fileCid, chunks, sha256, uri, includeData, platformId = "1", resumeFrom, onProgress }: AptosChunkedAnchorParams
): Promise<ChunkedAnchorReceipt> => {
  const chain = resolveAptosChain(chainId);
  const embedData = includeData ?? chain.embedsChunkData ?? false;
  const total = chunks.length;
  const txHashes: string[] = [];
  // Clamp so a stale resume index can only ever skip chunk anchors; the
  // file-level anchor is always re-sent by the run that completes.
  const startAt = Math.min(Math.max(Math.floor(resumeFrom ?? 0), 0), total);

  for (const [index, chunk] of chunks.entries()) {
    if (index < startAt) continue; // landed in a previous attempt
    onProgress?.({ stage: "signing", chunksAnchored: chunk.index, chunksTotal: total });
    const payload = buildChunkAnchorPayload({ fileCid, chunk, total, includeData: embedData });
    assertAptosPayloadFits(payload);
    let hash: string;
    try {
      ({ hash } = await signer.signAndSubmitTransaction(
        anchorPayload(chain.moduleAddress, chunk.cid, payload)
      ));
    } catch (error) {
      // Don't discard the chunk transactions that already landed.
      // `failedIndex` stays absolute so it can seed the next `resumeFrom`.
      throw new PartialAnchorError(txHashes, txHashes.length, index, error);
    }
    txHashes.push(hash);
    onProgress?.({
      stage: "submitting",
      chunksAnchored: chunk.index + 1,
      chunksTotal: total,
      txHash: hash,
    });
  }

  onProgress?.({ stage: "signing", chunksAnchored: total, chunksTotal: total });
  const filePayload = buildFileAnchorPayload({ cid: fileCid, sha256, uri, platformId });
  assertAptosPayloadFits(filePayload);
  let fileTxHash: string;
  try {
    ({ hash: fileTxHash } = await signer.signAndSubmitTransaction(
      anchorPayload(chain.moduleAddress, fileCid, filePayload)
    ));
  } catch (error) {
    throw new PartialAnchorError(txHashes, txHashes.length, chunks.length, error);
  }
  txHashes.push(fileTxHash);
  onProgress?.({ stage: "confirmed", chunksAnchored: total, chunksTotal: total, txHash: fileTxHash });

  return {
    chainId: chain.id,
    txHashes,
    txHash: fileTxHash,
    submitter: signer.address,
  };
};
