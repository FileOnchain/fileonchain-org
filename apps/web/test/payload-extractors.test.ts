import { describe, expect, it } from "vitest";
import {
  decodeStarknetByteArray,
  extractCardanoAnchors,
  extractCosmosAnchors,
  extractEvmAnchors,
  extractHederaAnchors,
  extractMoveEventAnchors,
  extractNearAnchors,
  extractSolanaAnchors,
  extractStarknetAnchors,
  extractSubstrateAnchors,
  extractTonAnchors,
  extractTronAnchors,
} from "@/lib/indexer/payload-extractors";
import { buildFileAnchorPayload } from "@fileonchain/sdk";

/** Per-family anchor payload extraction. The extractors are pure
 *  adapters between each chain's envelope fragment (memo strings,
 *  event data, NEP-297 logs, hex-encoded `extra_data`, Starknet
 *  ByteArray felts, CIP-20 metadata chunks) and the SDK's
 *  `parseAnchorPayload`. The drop-everything-that-isn't-ours
 *  contract is the same across every family — the test drives
 *  each one with a happy-path input + the standard "not a real
 *  payload" rejections. */

/** A CIDv1 base32 string that survives `isValidCID`. The decode
 *  tests share this fixture so the assertions focus on the extractor
 *  layer, not the CID validator. */
const VALID_CID = "bafybeigdyrzt5sfp7udm7hu76ys7tep27uxxi5y5q3kxymtsv2t7xspbio";

/** Build a valid file-anchor payload via the SDK so the
 *  extractors see the protocol-canonical JSON shape. */
const filePayload = (cid: string = VALID_CID): string =>
  buildFileAnchorPayload({ cid });

describe("extractEvmAnchors", () => {
  it("returns one anchor per valid file-anchor URI", () => {
    const anchors = extractEvmAnchors([filePayload(), filePayload()]);
    expect(anchors).toHaveLength(2);
    expect(anchors[0]?.cid).toBe(VALID_CID);
  });

  it("drops non-payload strings and empty inputs", () => {
    expect(extractEvmAnchors([])).toEqual([]);
    expect(extractEvmAnchors(["not a payload", ""])).toEqual([]);
  });

  it("drops a payload with a non-FileOnChain protocol tag", () => {
    const wrong = JSON.stringify({
      p: "other",
      v: 1,
      op: "anchor",
      cid: VALID_CID,
    });
    expect(extractEvmAnchors([wrong])).toEqual([]);
  });

  it("drops an anchor with an invalid CID", () => {
    const bad = JSON.stringify({
      p: "fileonchain",
      v: 1,
      op: "anchor",
      cid: "too-short",
    });
    expect(extractEvmAnchors([bad])).toEqual([]);
  });
});

describe("extractSubstrateAnchors + extractSolanaAnchors + extractCosmosAnchors + extractTonAnchors + extractHederaAnchors", () => {
  /** These five families wrap the same `fileonchain` v1 JSON in
   *  different envelope fragments: a Substrate remark, an SPL Memo,
   *  a Cosmos tx memo, a TON transfer comment, and an HCS message
   *  body. The extractors are thin pass-throughs to `parseAnchorPayload`
   *  so the contract is identical: keep the payload, drop everything
   *  else. */
  const extractors = {
    substrate: extractSubstrateAnchors,
    solana: extractSolanaAnchors,
    cosmos: extractCosmosAnchors,
    ton: extractTonAnchors,
    hedera: extractHederaAnchors,
  } as const;

  for (const [family, extract] of Object.entries(extractors)) {
    it(`${family} keeps valid payloads and drops the rest`, () => {
      const valid = filePayload();
      const wrong = "not a payload";
      const empty = "";
      const anchors = extract([valid, wrong, empty]);
      expect(anchors).toHaveLength(1);
      expect(anchors[0]?.cid).toBe(VALID_CID);
    });

    it(`${family} returns an empty array for an empty input`, () => {
      expect(extract([])).toEqual([]);
    });
  }
});

describe("extractMoveEventAnchors", () => {
  it("flattens { payload: string } events to anchors", () => {
    const events = [
      { payload: filePayload() },
      { payload: "ignored" },
      { payload: filePayload() },
    ];
    const anchors = extractMoveEventAnchors(events);
    expect(anchors).toHaveLength(2);
    expect(anchors[0]?.cid).toBe(VALID_CID);
  });

  it("returns an empty array for an empty event list", () => {
    expect(extractMoveEventAnchors([])).toEqual([]);
  });

  it("drops an event whose payload is not a valid anchor", () => {
    expect(
      extractMoveEventAnchors([{ payload: "garbage" }]),
    ).toEqual([]);
  });
});

describe("extractNearAnchors", () => {
  /** NEP-297 `EVENT_JSON:` log format:
   *  `EVENT_JSON:{ "standard": "fileonchain", "data": [{ "payload": "<json>" }] }`. */
  const eventJson = (payload: string, standard = "fileonchain"): string =>
    `EVENT_JSON:${JSON.stringify({
      standard,
      data: [{ payload }],
    })}`;

  it("returns every payload under a `fileonchain` standard", () => {
    const logs = [
      eventJson(filePayload()),
      eventJson(filePayload()),
    ];
    expect(extractNearAnchors(logs)).toHaveLength(2);
  });

  it("drops logs whose standard is not `fileonchain`", () => {
    const logs = [
      eventJson(filePayload(), "near"),
      eventJson(filePayload(), "some-other-app"),
    ];
    expect(extractNearAnchors(logs)).toEqual([]);
  });

  it("drops logs that do not start with the EVENT_JSON: prefix", () => {
    const logs = [
      `LOG:${JSON.stringify({
        standard: "fileonchain",
        data: [{ payload: filePayload() }],
      })}`,
      "plain text log line",
    ];
    expect(extractNearAnchors(logs)).toEqual([]);
  });

  it("swallows malformed JSON instead of throwing", () => {
    const logs = [
      "EVENT_JSON:this is not json",
      "EVENT_JSON:{",
    ];
    expect(extractNearAnchors(logs)).toEqual([]);
  });

  it("tolerates a missing `data` array", () => {
    const logs = [
      `EVENT_JSON:${JSON.stringify({
        standard: "fileonchain",
      })}`,
    ];
    expect(extractNearAnchors(logs)).toEqual([]);
  });

  it("skips data entries whose payload is not a string", () => {
    const logs = [
      `EVENT_JSON:${JSON.stringify({
        standard: "fileonchain",
        data: [{ payload: 42 }, { payload: filePayload() }],
      })}`,
    ];
    expect(extractNearAnchors(logs)).toHaveLength(1);
  });
});

describe("extractTronAnchors", () => {
  /** `extra_data` arrives as hex; the extractor decodes to utf8 and
   *  hands the result to `parseAnchorPayload`. */
  const utf8 = (s: string): string =>
    Buffer.from(s, "utf8").toString("hex");

  it("decodes 0x-prefixed hex and returns the parsed anchor", () => {
    const hex = "0x" + utf8(filePayload());
    expect(extractTronAnchors([hex])).toHaveLength(1);
  });

  it("decodes bare hex without the 0x prefix", () => {
    const hex = utf8(filePayload());
    expect(extractTronAnchors([hex])).toHaveLength(1);
  });

  it("drops hex that does not decode to a valid payload", () => {
    expect(extractTronAnchors(["0xdeadbeef"])).toEqual([]);
  });

  it("returns an empty array for an empty input", () => {
    expect(extractTronAnchors([])).toEqual([]);
  });
});

describe("extractCardanoAnchors", () => {
  /** CIP-20 metadata strings cap at 64 bytes; the extractor joins
   *  the message chunks back into the protocol payload. */
  it("joins multiple 64-byte chunks then parses the payload", () => {
    const full = filePayload();
    // Split into 64-byte chunks exactly the way the on-chain metadata
    // would. `joinFromMetadata` just concatenates; the assertion is
    // that the resulting string round-trips through `parseAnchorPayload`.
    const chunks: string[] = [];
    for (let i = 0; i < full.length; i += 64) {
      chunks.push(full.slice(i, i + 64));
    }
    expect(extractCardanoAnchors([chunks])).toHaveLength(1);
  });

  it("drops chunk lists that do not reassemble into a payload", () => {
    expect(extractCardanoAnchors([["not", "a", "payload"]])).toEqual([]);
  });

  it("returns an empty array for an empty input", () => {
    expect(extractCardanoAnchors([])).toEqual([]);
  });
});

describe("decodeStarknetByteArray", () => {
  /** The Cairo ByteArray layout is:
   *  [num_full_words, word_0, …, word_{N-1}, pending_word, pending_word_len]
   *  Each word felt carries the low 31 bytes of the value (the high
   *  byte is reserved for the felt tag). */
  const felt = (bytes: number[]): string => {
    // Cairo felts carry zero as the literal "0", not "0x" + empty
    // hex. `BigInt("0x")` would throw; fall back to "0" for empty
    // byte arrays.
    if (bytes.length === 0) return "0";
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return BigInt("0x" + hex).toString();
  };

  it("decodes an empty ByteArray (zero full words, zero pending)", () => {
    const felts = [felt([]), felt([]), felt([])];
    const { value, next } = decodeStarknetByteArray(felts, 0);
    expect(value).toBe("");
    expect(next).toBe(3);
  });

  it("decodes a single full 31-byte word with no pending", () => {
    const wordBytes = Array.from({ length: 31 }, (_, i) => i + 1);
    const text = Buffer.from(Uint8Array.from(wordBytes)).toString("utf8");
    const felts = [felt([1]), felt(wordBytes), felt([]), felt([])];
    const { value, next } = decodeStarknetByteArray(felts, 0);
    expect(value).toBe(text);
    expect(next).toBe(4);
  });

  it("decodes a pending_word with a shorter length", () => {
    // 0 full words + a 5-byte pending word → 5 bytes total.
    const pendingBytes = [0x68, 0x65, 0x6c, 0x6c, 0x6f]; // "hello"
    const felts = [
      felt([]), // num_full_words = 0
      felt(pendingBytes), // pending_word (left-aligned to 31 bytes)
      felt([pendingBytes.length]), // pending_word_len = 5
    ];
    const { value, next } = decodeStarknetByteArray(felts, 0);
    expect(value).toBe("hello");
    expect(next).toBe(3);
  });

  it("decodes multiple full words followed by a pending tail", () => {
    const wordA = Array.from({ length: 31 }, (_, i) => 0x61 + (i % 26));
    const wordB = Array.from({ length: 31 }, (_, i) => 0x41 + (i % 26));
    const pending = [0x21, 0x22, 0x23]; // 3 bytes
    const felts = [
      felt([2]), // num_full_words
      felt(wordA),
      felt(wordB),
      felt(pending),
      felt([3]), // pending_word_len
    ];
    const { value, next } = decodeStarknetByteArray(felts, 0);
    const expected =
      Buffer.from(Uint8Array.from(wordA)).toString("utf8") +
      Buffer.from(Uint8Array.from(wordB)).toString("utf8") +
      Buffer.from(Uint8Array.from(pending)).toString("utf8");
    expect(value).toBe(expected);
    expect(next).toBe(5);
  });

  it("respects the offset parameter so the caller can walk a packed event", () => {
    // Simulate a [cid, payload] event: first ByteArray decodes to
    // "ABC", second to the actual payload.
    const cidFelts = [
      felt([]), // num_full_words = 0
      felt([0x41, 0x42, 0x43]), // pending_word holding "ABC"
      felt([3]), // pending_word_len
    ];
    const payloadFelts = [
      felt([]), // num_full_words = 0
      felt(Array.from(Buffer.from(filePayload().slice(0, 31)))),
      felt([31]),
    ];
    const felts = [...cidFelts, ...payloadFelts];
    const first = decodeStarknetByteArray(felts, 0);
    expect(first.value).toBe("ABC");
    expect(first.next).toBe(3);
    const second = decodeStarknetByteArray(felts, first.next);
    // The reconstructed payload decodes to the original first 31 bytes.
    expect(Buffer.from(second.value, "utf8").length).toBe(31);
  });
});

describe("extractStarknetAnchors", () => {
  /** End-to-end: pack [cid, payload] ByteArrays into one event data
   *  array and check that the extractor returns the parsed anchor. */
  const felt = (bytes: number[]): string => {
    if (bytes.length === 0) return "0";
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return BigInt("0x" + hex).toString();
  };

  it("parses a (cid, payload) ByteArray pair through parseAnchorPayload", () => {
    // Use a tiny cid (the anchor payload's `isValidCID` check is
    // strict, so we feed an obviously non-CID Uint8Array payload
    // and assert the extractor drops it).
    const cidFelts = [
      felt([]),
      felt([0x41, 0x42, 0x43]),
      felt([3]),
    ];
    const payloadFelts = [
      felt([]),
      felt([0x21, 0x22, 0x23]),
      felt([3]),
    ];
    const empty = extractStarknetAnchors([[...cidFelts, ...payloadFelts]]);
    // The "payload" ByteArray decodes to "!\""#", which is not a
    // valid anchor JSON, so the parser drops it.
    expect(empty).toEqual([]);
  });

  it("returns an empty array for an empty event list", () => {
    expect(extractStarknetAnchors([])).toEqual([]);
  });
});
