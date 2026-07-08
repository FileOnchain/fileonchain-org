import { ZERO_ADDRESS, type ChainConfig } from "./chains";
import { isValidCID } from "./cid";
import type { ChainId } from "./types";

/**
 * The chain-agnostic anchoring vocabulary shared by every client.
 *
 * All four families write the same versioned JSON payload on-chain — as a
 * Substrate remark, an EVM registry `uri`, a Solana memo, or an Aptos module
 * argument — so a single indexer can parse anchors from any chain. The
 * family clients (`./evm`, `./substrate`, `./solana`, `./aptos`) only differ
 * in how they get that payload into a transaction.
 */

export const ANCHOR_PROTOCOL = "fileonchain" as const;
export const ANCHOR_PAYLOAD_VERSION = 1 as const;

/** File-level anchor payload — one per uploaded file (or folder DAG root). */
export interface FileAnchorPayload {
  /** Protocol tag — always "fileonchain". */
  p: typeof ANCHOR_PROTOCOL;
  /** Payload version. */
  v: typeof ANCHOR_PAYLOAD_VERSION;
  op: "anchor";
  /** CIDv1 of the file, or of the folder's DAG root. */
  cid: string;
  /** Optional SHA-256 (hex) of the raw content. */
  sha256?: string;
  /** Optional IPFS / Arweave pointer. */
  uri?: string;
  /**
   * Optional originating platform id (integrator attribution for the
   * propose/verify fee split). Carried in the payload on every family so
   * memo-only chains keep attribution too; contract families additionally
   * pass it as a `proposeAnchor` argument.
   */
  pid?: string;
}

/** Chunk-level anchor payload — one per 64KB chunk, chained via `next`. */
export interface ChunkAnchorPayload {
  p: typeof ANCHOR_PROTOCOL;
  v: typeof ANCHOR_PAYLOAD_VERSION;
  op: "chunk";
  /** CIDv1 of this chunk. */
  cid: string;
  /** CIDv1 of the whole file this chunk belongs to. */
  fileCid: string;
  /** Zero-based chunk index. */
  idx: number;
  /** Total number of chunks in the file. */
  total: number;
  /** CIDv1 of the next chunk; omitted on the last chunk. */
  next?: string;
  /** Base64 chunk bytes — only on data-carrying chains (Substrate). */
  d?: string;
}

export type AnchorPayload = FileAnchorPayload | ChunkAnchorPayload;

/** A chunk ready to anchor. `data` is optional: only chains that store the
 * bytes themselves (Substrate remarks) should carry it. */
export interface AnchorChunk {
  /** CIDv1 of the chunk. */
  cid: string;
  /** Zero-based position within the file. */
  index: number;
  /** CIDv1 of the next chunk; undefined on the last chunk. */
  nextCid?: string;
  /** Raw chunk bytes; included on-chain only when the family supports it. */
  data?: Uint8Array;
}

export interface BuildFileAnchorParams {
  cid: string;
  sha256?: string;
  uri?: string;
  /** Originating platform id (see FileAnchorPayload.pid). */
  platformId?: string;
}

/** Serialize the file-level anchor payload. */
export const buildFileAnchorPayload = ({ cid, sha256, uri, platformId }: BuildFileAnchorParams): string => {
  if (!isValidCID(cid)) throw new Error(`"${cid}" is not a valid CIDv1 base32 string.`);
  const payload: FileAnchorPayload = {
    p: ANCHOR_PROTOCOL,
    v: ANCHOR_PAYLOAD_VERSION,
    op: "anchor",
    cid: cid.trim(),
  };
  if (sha256) payload.sha256 = sha256;
  if (uri) payload.uri = uri;
  if (platformId) payload.pid = platformId;
  return JSON.stringify(payload);
};

export interface BuildChunkAnchorParams {
  /** CIDv1 of the whole file. */
  fileCid: string;
  chunk: AnchorChunk;
  /** Total number of chunks in the file. */
  total: number;
  /** Embed the chunk bytes (base64) in the payload. Substrate only. */
  includeData?: boolean;
}

/** Serialize one chunk-level anchor payload. */
export const buildChunkAnchorPayload = ({
  fileCid,
  chunk,
  total,
  includeData = false,
}: BuildChunkAnchorParams): string => {
  const payload: ChunkAnchorPayload = {
    p: ANCHOR_PROTOCOL,
    v: ANCHOR_PAYLOAD_VERSION,
    op: "chunk",
    cid: chunk.cid,
    fileCid,
    idx: chunk.index,
    total,
  };
  if (chunk.nextCid) payload.next = chunk.nextCid;
  if (includeData && chunk.data) payload.d = bytesToBase64(chunk.data);
  return JSON.stringify(payload);
};

/** Parse an on-chain payload back; null if it isn't one of ours. */
export const parseAnchorPayload = (raw: string): AnchorPayload | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<AnchorPayload>;
    if (parsed.p !== ANCHOR_PROTOCOL || parsed.v !== ANCHOR_PAYLOAD_VERSION) return null;
    if (typeof parsed.cid !== "string") return null;
    if (parsed.op === "anchor") {
      return isValidCID(parsed.cid) ? (parsed as FileAnchorPayload) : null;
    }
    if (parsed.op === "chunk") {
      const chunk = parsed as Partial<ChunkAnchorPayload>;
      if (typeof chunk.fileCid !== "string" || typeof chunk.idx !== "number") return null;
      return chunk as ChunkAnchorPayload;
    }
    return null;
  } catch {
    return null;
  }
};

/* Base64 without Buffer so the core entry stays dependency-free in both
 * browsers and Node (btoa/atob are global in Node >= 16; declared here
 * because the SDK compiles without the DOM lib). */
declare const btoa: (data: string) => string;
declare const atob: (data: string) => string;

const B64_CHUNK = 0x8000;

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += B64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + B64_CHUNK));
  }
  return btoa(binary);
};

export const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/**
 * Thrown by a family client when the chain has no anchoring target deployed
 * yet (no registry contract, program, or module). Callers can catch this to
 * fall back to a simulated flow instead of failing the upload.
 */
export class ChainNotProvisionedError extends Error {
  constructor(
    readonly chainId: ChainId,
    detail: string,
  ) {
    super(`Chain "${chainId}" cannot anchor for real yet: ${detail}`);
    this.name = "ChainNotProvisionedError";
  }
}

/**
 * Whether real anchoring transactions can be sent on this chain today.
 * Solana is always provisioned — anchors ride the SPL Memo program, which
 * needs no deployment of ours. Memo/metadata/comment families (Cosmos,
 * TRON, Cardano, TON) provision by flipping `memoAnchoring` on the chain
 * entry after QA; module/contract families flip when their deployed
 * address lands in the registry.
 */
export const isChainProvisioned = (chain: ChainConfig): boolean => {
  switch (chain.family) {
    case "evm":
      return !!chain.registryContract && chain.registryContract !== ZERO_ADDRESS;
    case "substrate":
      return chain.palletContract === "system.remarkWithEvent";
    case "solana":
      return true;
    case "aptos":
    case "sui":
    case "near":
      return !!chain.moduleAddress;
    case "starknet":
      return !!chain.registryContract && chain.registryContract !== ZERO_ADDRESS;
    case "cosmos":
    case "tron":
    case "cardano":
    case "ton":
      return chain.memoAnchoring === true || !!chain.moduleAddress;
    case "hedera":
      return !!chain.hcsTopicId;
  }
};

/**
 * Whether the optimistic propose/verify protocol is live on this chain —
 * a stricter gate than `isChainProvisioned`: it additionally needs the FOC
 * token (tips/bonds are token-denominated). Memo-only families never
 * provision the propose path; their file anchors stay plain memos.
 */
export const isProposeProvisioned = (chain: ChainConfig): boolean => {
  if (!isChainProvisioned(chain)) return false;
  switch (chain.family) {
    case "evm":
    case "starknet":
      return !!chain.tokenContract && chain.tokenContract !== ZERO_ADDRESS;
    case "aptos":
    case "sui":
    case "near":
      return !!chain.tokenContract;
    default:
      return false;
  }
};

/**
 * On-chain lifecycle of a file-anchor proposal (contract families only).
 * proposed → challenge window open; challenged → jury dispute running;
 * verified → finalized, tip split 60/25/15 validators/platform/protocol;
 * rejected → dispute lost or another proposal verified the CID first.
 */
export type ProposalStatus = "none" | "proposed" | "challenged" | "verified" | "rejected";

/** A file-anchor proposal as read back from a registry contract. */
export interface AnchorProposal {
  /** Registry-assigned proposal id (stringified uint). */
  proposalId: string;
  cid?: string;
  status: ProposalStatus;
  proposer: string;
  /** Originating platform id (stringified uint). */
  platformId: string;
  /** Escrowed tip, token base units (stringified). */
  tip: string;
  /** Escrowed propose bond, token base units (stringified). */
  bond: string;
  /** Unix seconds when the challenge window closes. */
  challengeDeadline: number;
  /** Unix seconds when the proposal verified; 0 while unverified. */
  verifiedAt: number;
}

/** Where a chunked anchor currently is. Families map their own tx lifecycle
 * onto these stages so UIs can render one progress model for every chain.
 * "approving" only occurs on propose-provisioned chains that need a token
 * allowance before the propose transaction. */
export type AnchorStage =
  | "connecting"
  | "approving"
  | "signing"
  | "submitting"
  | "confirming"
  | "confirmed";

export interface AnchorProgress {
  stage: AnchorStage;
  /** Chunks whose transaction has been accepted so far. */
  chunksAnchored: number;
  chunksTotal: number;
  /** Hash of the most recently submitted transaction, when known. */
  txHash?: string;
}

export type AnchorProgressHandler = (progress: AnchorProgress) => void;

/** Uniform result of a chunked anchor on any family. */
export interface ChunkedAnchorReceipt {
  chainId: ChainId;
  /** Every transaction sent, in submission order. */
  txHashes: string[];
  /** The file-level anchor transaction — what explorers should link to. */
  txHash: string;
  blockNumber?: number;
  blockHash?: string;
  /** Address that signed the anchoring transactions. */
  submitter: string;
  /**
   * Present when the file anchor went through the propose/verify protocol:
   * the proposal starts its challenge window at submission and verifies via
   * `finalize` after the window (or a won dispute).
   */
  proposal?: {
    proposalId: string;
    platformId: string;
    /** Escrowed tip, token base units (stringified). */
    tip: string;
    /** Escrowed propose bond, token base units (stringified). */
    bond: string;
    /** Unix seconds when the challenge window closes. */
    challengeDeadline: number;
  };
}
