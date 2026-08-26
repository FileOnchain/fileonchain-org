import type { ChainId } from "@fileonchain/sdk";
import type { StorageMode } from "@/hooks/useFileUploader";

/**
 * Partially-landed pay-as-you-go anchors. A chunked anchor is dozens of
 * user-confirmed transactions; when one in the middle fails (out of gas, a
 * rejected signature, a dropped RPC) the ones that already landed stay
 * valid on-chain. This module remembers exactly where the run stopped so
 * the next attempt of the identical upload resumes from the failed send
 * instead of re-paying for everything — surviving a page reload, since the
 * chunking is deterministic for the same file and settings.
 */

/** Everything that shapes the payload stream — resume only applies when
 * all of it is unchanged, otherwise the saved send index means nothing. */
export interface AnchorFingerprintParts {
  fileCid: string;
  chainId: ChainId;
  storageChainId: ChainId | null;
  storageMode: StorageMode;
  externalUri: string;
  chunkCount: number;
  chunkSize: number;
}

export const anchorFingerprint = (parts: AnchorFingerprintParts): string =>
  [
    parts.fileCid,
    parts.chainId,
    parts.storageChainId ?? "-",
    parts.storageMode,
    parts.externalUri,
    parts.chunkCount,
    parts.chunkSize,
  ].join("|");

export interface PartialAnchorState {
  /** Fingerprint of the request the progress belongs to. */
  fingerprint: string;
  /** Which pass failed: bytes to the storage system, or the settlement pass. */
  phase: "storing" | "anchoring";
  /** `failedIndex` from the family SDK's PartialAnchorError — the send
   * (payload or batch, per family) the next attempt resumes from. */
  resumeFrom: number;
  /** Every transaction the failed pass landed, across attempts, in order. */
  txHashes: string[];
  /** Completed storage-pass results, kept so an anchor-pass resume doesn't
   * store the bytes a second time. */
  storageTxHashes?: string[];
  storageTxHash?: string;
  uri?: string;
  savedAt: number;
}

const STORAGE_KEY = "fileonchain:partial-anchor";

/** Old enough that the fee/nonce context has surely moved on. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Load the saved partial state matching `fingerprint`, if any. */
export const loadPartialAnchor = (fingerprint: string): PartialAnchorState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as PartialAnchorState;
    if (state.fingerprint !== fingerprint) return null;
    if (!Array.isArray(state.txHashes) || typeof state.resumeFrom !== "number") return null;
    if (Date.now() - state.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
};

export const savePartialAnchor = (state: PartialAnchorState): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota / private mode — in-memory resume still works for this session.
  }
};

export const clearPartialAnchor = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
};
