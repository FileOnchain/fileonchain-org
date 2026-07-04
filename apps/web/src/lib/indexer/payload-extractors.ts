import {
  parseAnchorPayload,
  type AnchorPayload,
  type ChainFamily,
} from "@fileonchain/sdk";
import { joinFromMetadata } from "@fileonchain/sdk/cardano";

/* TODO: wire to per-chain tx fetches — explorer detail pages should fetch a
 * confirmed transaction from the chain's RPC / mirror node and run it
 * through the matching extractor below. The extractors themselves are pure
 * and final; only the fetch layer is missing (see lib/mock/cid-indexer.ts,
 * which fakes the result today). */

/**
 * Family-specific tx→payload extraction. Every family writes the same
 * `fileonchain` v1 JSON (FR-4/FR-6); what differs is the transaction
 * envelope it rides in. Each extractor takes the family's envelope
 * fragment(s) — memo strings, event data, metadata chunks — and returns the
 * parsed anchors, dropping anything that isn't ours.
 */

const parseAll = (raws: readonly string[]): AnchorPayload[] =>
  raws
    .map((raw) => parseAnchorPayload(raw))
    .filter((payload): payload is AnchorPayload => payload !== null);

/** EVM: the payload is the `uri` argument of `FileRegistry.anchorCID`
 * calldata (events carry only hashes). */
export const extractEvmAnchors = (uris: readonly string[]): AnchorPayload[] =>
  parseAll(uris);

/** Substrate: `system.remarkWithEvent` remark strings, one per anchor
 * (possibly several inside one `utility.batchAll`). */
export const extractSubstrateAnchors = (remarks: readonly string[]): AnchorPayload[] =>
  parseAll(remarks);

/** Solana: SPL Memo instruction data, decoded to utf8. */
export const extractSolanaAnchors = (memos: readonly string[]): AnchorPayload[] =>
  parseAll(memos);

/** Aptos / Sui: `CIDAnchored` events carry the payload verbatim. */
export const extractMoveEventAnchors = (
  events: ReadonlyArray<{ payload: string }>,
): AnchorPayload[] => parseAll(events.map((event) => event.payload));

/** Cosmos: the tx memo field. */
export const extractCosmosAnchors = (memos: readonly string[]): AnchorPayload[] =>
  parseAll(memos);

/** NEAR: NEP-297 `EVENT_JSON:` logs from the registry contract. */
export const extractNearAnchors = (logs: readonly string[]): AnchorPayload[] => {
  const payloads: string[] = [];
  for (const log of logs) {
    if (!log.startsWith("EVENT_JSON:")) continue;
    try {
      const event = JSON.parse(log.slice("EVENT_JSON:".length)) as {
        standard?: string;
        data?: Array<{ payload?: string }>;
      };
      if (event.standard !== "fileonchain") continue;
      for (const item of event.data ?? []) {
        if (typeof item.payload === "string") payloads.push(item.payload);
      }
    } catch {
      // Not JSON — some other contract's log.
    }
  }
  return parseAll(payloads);
};

/** TRON: the transaction's `extra_data` field, hex-decoded to utf8. */
export const extractTronAnchors = (extraDataHex: readonly string[]): AnchorPayload[] =>
  parseAll(
    extraDataHex.map((hex) =>
      Buffer.from(hex.replace(/^0x/i, ""), "hex").toString("utf8"),
    ),
  );

/** Cardano: CIP-20 label 674 `msg` string arrays, re-joined (metadata
 * strings cap at 64 bytes — see the SDK cardano client). */
export const extractCardanoAnchors = (
  msgChunkLists: ReadonlyArray<readonly string[]>,
): AnchorPayload[] =>
  parseAll(msgChunkLists.map((chunks) => joinFromMetadata([...chunks])));

/** TON: transfer comment text. */
export const extractTonAnchors = (comments: readonly string[]): AnchorPayload[] =>
  parseAll(comments);

/** Hedera: HCS message bodies from the mirror node (base64 there —
 * decode before calling). */
export const extractHederaAnchors = (messages: readonly string[]): AnchorPayload[] =>
  parseAll(messages);

/**
 * Starknet: `CIDAnchored` event data is two Cairo ByteArrays
 * (num_full_words, …31-byte word felts…, pending_word, pending_word_len).
 * Decode one ByteArray starting at `offset`; returns the string and the
 * next offset so callers can walk cid then payload.
 */
export const decodeStarknetByteArray = (
  felts: readonly string[],
  offset: number,
): { value: string; next: number } => {
  const fullWords = Number(BigInt(felts[offset]));
  let bytes: number[] = [];
  const feltBytes = (felt: string, width?: number): number[] => {
    let hex = BigInt(felt).toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    const out = Array.from(Buffer.from(hex, "hex"));
    return width !== undefined ? out.slice(-width) : out;
  };
  for (let i = 0; i < fullWords; i += 1) {
    bytes = bytes.concat(feltBytes(felts[offset + 1 + i], 31));
  }
  const pendingLen = Number(BigInt(felts[offset + 1 + fullWords + 1]));
  if (pendingLen > 0) {
    bytes = bytes.concat(feltBytes(felts[offset + 1 + fullWords], pendingLen));
  }
  return {
    value: Buffer.from(Uint8Array.from(bytes)).toString("utf8"),
    next: offset + fullWords + 3,
  };
};

/** Starknet: event data felts → [cid ByteArray, payload ByteArray]. */
export const extractStarknetAnchors = (
  eventDataFelts: ReadonlyArray<readonly string[]>,
): AnchorPayload[] =>
  parseAll(
    eventDataFelts.map((felts) => {
      const cid = decodeStarknetByteArray(felts, 0);
      return decodeStarknetByteArray(felts, cid.next).value;
    }),
  );

/** One extractor vocabulary per family, for explorer detail pages. The
 * input shape is the family's envelope fragment — see each extractor. */
export const ANCHOR_EXTRACTORS: Record<ChainFamily, (input: never) => AnchorPayload[]> = {
  evm: extractEvmAnchors,
  substrate: extractSubstrateAnchors,
  solana: extractSolanaAnchors,
  aptos: extractMoveEventAnchors,
  sui: extractMoveEventAnchors,
  cosmos: extractCosmosAnchors,
  starknet: extractStarknetAnchors,
  near: extractNearAnchors,
  tron: extractTronAnchors,
  cardano: extractCardanoAnchors,
  ton: extractTonAnchors,
  hedera: extractHederaAnchors,
};
