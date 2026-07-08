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
   * Originating platform id for the propose/verify fee split. Defaults to
   * NEXT_PUBLIC_FILEONCHAIN_PLATFORM_ID, then the chain's
   * `defaultPlatformId`, then platform 1 (FileOnChain).
   */
  platformId?: string;
  /** FOC tip in base units; contract families default to the on-chain minTip. */
  tip?: bigint;
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
