import type { ChainConfig } from "./chains";
import { getChain } from "./chains";
import { isValidCID } from "./cid";
import type { ChainFamily, ChainId } from "./types";

/**
 * On-chain file storage vocabulary.
 *
 * FileOnChain stores file bytes on-chain by embedding them (base64 `d`
 * field) in chunk anchor payloads — the same versioned JSON every family
 * writes, so a stored file is readable back with `parseAnchorPayload` on
 * any chain. How many raw bytes fit per transaction differs wildly by
 * family, so this module owns the per-family budgets, the derived raw-chunk
 * size used to slice files for a given storage chain, and the
 * `fileonchain://` URI that anchors on *other* chains use to point at the
 * chain holding the bytes.
 */

/**
 * Serialized anchor-payload bytes one transaction can carry, per family —
 * kept in sync with each family SDK's cap (`DEFAULT_MAX_MEMO_BYTES`,
 * `MAX_HCS_MESSAGE_BYTES`, …). Values for the contract families are
 * conservative single-call argument budgets, not theoretical tx-size
 * maxima.
 */
export const FAMILY_PAYLOAD_BUDGET_BYTES: Record<ChainFamily, number> = {
  substrate: 131072, // remarks batch up to 1 MiB; one 64 KiB chunk fits easily
  evm: 98304, // payload string in calldata — ~1.6M gas of calldata at 16 gas/byte
  solana: 700, // one SPL Memo inside a 1232-byte packet
  aptos: 49152, // entry-function string arg within the 64 KiB tx cap
  cosmos: 256, // Cosmos Hub default maxMemoCharacters
  sui: 16384, // pure-argument size limit per call
  starknet: 32768, // ByteArray calldata, conservative
  near: 65536, // function-call args, conservative
  tron: 2048, // transaction data/memo field
  cardano: 8192, // CIP-20 metadata (64-byte string array) within tx limits
  ton: 1000, // text comment on a transfer
  hedera: 1024, // single HCS message
};

/**
 * Worst-case size of a chunk payload's JSON envelope (everything except the
 * base64 data): protocol tag, two CIDv1 base32 strings (~60 chars each), a
 * `next` CID, indices, and punctuation.
 */
export const CHUNK_ENVELOPE_BYTES = 320;

/** Below this many raw bytes per transaction, on-chain storage is refused
 * rather than exploded into absurd transaction counts. */
export const MIN_CHUNK_DATA_BYTES = 64;

/** The protocol's canonical maximum chunk size — chunks are at most 64 KiB
 * everywhere, even where a transport could carry more. */
export const MAX_CHUNK_DATA_BYTES = 64 * 1024;

/**
 * Raw file bytes one chunk anchor can store on `chain`, after the JSON
 * envelope and base64 inflation (4/3) — or `null` when the chain's
 * transport can't fit a meaningful slice (Cosmos memos hold ~256 bytes,
 * which the envelope alone exceeds). Rounded down to a 64-byte multiple
 * and capped at the protocol's 64 KiB chunk size.
 */
export const getChunkDataBudget = (chain: ChainConfig): number | null => {
  const payloadBudget = FAMILY_PAYLOAD_BUDGET_BYTES[chain.family];
  const raw = Math.floor(((payloadBudget - CHUNK_ENVELOPE_BYTES) * 3) / 4);
  const budget = Math.min(Math.floor(raw / 64) * 64, MAX_CHUNK_DATA_BYTES);
  return budget >= MIN_CHUNK_DATA_BYTES ? budget : null;
};

/**
 * Whether `chain`'s transport can physically carry chunk bytes. Orthogonal
 * to provisioning and rollout status — combine with `isChainProvisioned` /
 * `isChainActive` before offering the chain as a storage target.
 */
export const isStorageCapable = (chain: ChainConfig): boolean =>
  getChunkDataBudget(chain) !== null;

/** Number of storage transactions a file of `fileSizeBytes` needs on `chain`
 * (chunk anchors carrying data), or `null` when the chain can't store. */
export const storageChunkCount = (
  chain: ChainConfig,
  fileSizeBytes: number
): number | null => {
  const budget = getChunkDataBudget(chain);
  if (budget === null) return null;
  return Math.max(1, Math.ceil(fileSizeBytes / budget));
};

/* ------------------------------------------------------------------ */
/* Storage URIs                                                        */
/* ------------------------------------------------------------------ */

export const STORAGE_URI_SCHEME = "fileonchain" as const;

export interface StorageUriParts {
  chainId: ChainId;
  cid: string;
}

/**
 * The pointer a file anchor's `uri` carries when the bytes are stored as
 * chunk anchors on another chain: `fileonchain://<chainId>/<fileCid>`.
 * Anchors may also carry any external pointer (`ipfs://…`, `https://…`, an
 * Auto Drive CID) — this scheme is only for "the bytes live on chain X".
 */
export const buildStorageUri = (chainId: ChainId, fileCid: string): string => {
  if (!isValidCID(fileCid)) {
    throw new Error(`"${fileCid}" is not a valid CIDv1 base32 string.`);
  }
  return `${STORAGE_URI_SCHEME}://${chainId}/${fileCid}`;
};

/** Parse a `fileonchain://` storage URI back into its chain id + CID, or
 * return `null` for anything else (foreign schemes are legitimate). */
export const parseStorageUri = (uri: string): StorageUriParts | null => {
  const prefix = `${STORAGE_URI_SCHEME}://`;
  if (!uri.startsWith(prefix)) return null;
  const rest = uri.slice(prefix.length);
  const slash = rest.lastIndexOf("/");
  if (slash <= 0) return null;
  const chainId = rest.slice(0, slash) as ChainId;
  const cid = rest.slice(slash + 1);
  if (!getChain(chainId) || !isValidCID(cid)) return null;
  return { chainId, cid };
};
