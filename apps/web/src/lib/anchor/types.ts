import type {
  AnchorChunk,
  AnchorProgressHandler,
  ChainConfig,
} from "@fileonchain/sdk";

/** One chunked-anchor send, expressed the same way for every family. */
export interface AnchorRequest {
  chain: ChainConfig;
  /** CIDv1 of the whole file (the IPLD DAG root). */
  fileCid: string;
  chunks: AnchorChunk[];
  /**
   * Originating platform id carried in the anchor payload (attribution
   * only). Defaults to NEXT_PUBLIC_FILEONCHAIN_PLATFORM_ID, then
   * platform 1 (FileOnChain).
   */
  platformId?: string;
  /**
   * Embed the chunk bytes in the anchor payloads — on-chain storage.
   * Defaults to the chain's `embedsChunkData` flag (Autonomys stores by
   * default); pass `false` explicitly for a proof-only pass.
   */
  includeData?: boolean;
  /** Pointer to where the bytes live, on the file-level anchor — a
   * `fileonchain://<chainId>/<cid>` storage URI or any external location. */
  uri?: string;
  onProgress?: AnchorProgressHandler;
}

/** What the uploader UI needs back, regardless of family or fallback. */
export interface AnchorOutcome {
  /** The file-level anchor transaction — what explorers link to. */
  txHash: string;
  /** Every transaction sent, in submission order. */
  txHashes: string[];
  blockNumber?: number;
  timestamp: number;
  submitter: string;
  /** True when the chain has no deployment yet and the anchor was mocked. */
  simulated: boolean;
}
