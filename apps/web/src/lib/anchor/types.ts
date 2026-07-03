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
