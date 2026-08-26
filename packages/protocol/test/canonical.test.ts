import { describe, expect, it } from "vitest";
import { canonicalStringify, sha256HexUtf8 } from "../src/index";

describe("canonicalStringify", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("keeps array order and canonicalizes elements", () => {
    expect(canonicalStringify({ list: [{ z: 1, y: 2 }, 3] })).toBe('{"list":[{"y":2,"z":1},3]}');
  });

  it("omits undefined object members like JSON.stringify", () => {
    expect(canonicalStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("rejects undefined array elements instead of nulling them", () => {
    expect(() => canonicalStringify({ list: [1, undefined] })).toThrow(/array element/);
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalStringify({ n: Number.POSITIVE_INFINITY })).toThrow(/Non-finite/);
    expect(() => canonicalStringify({ n: Number.NaN })).toThrow(/Non-finite/);
  });

  it("rejects functions, symbols, and bigints", () => {
    expect(() => canonicalStringify({ f: () => 1 })).toThrow(/not canonical/);
    expect(() => canonicalStringify({ s: Symbol("x") })).toThrow(/not canonical/);
    expect(() => canonicalStringify({ b: 1n })).toThrow(/not canonical/);
  });

  it("does not normalize Unicode (NFC and NFD differ)", () => {
    const nfc = "é"; // U+00E9
    const nfd = "é"; // e + combining acute
    expect(canonicalStringify({ s: nfc })).not.toBe(canonicalStringify({ s: nfd }));
  });

  it("throws on an own __proto__ key instead of silently dropping it", () => {
    // JSON.parse defines "__proto__" as an own property; ordinary object
    // construction then routes it to the prototype setter and the key
    // would vanish from the canonical bytes.
    const parsed = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}') as unknown;
    expect(() => canonicalStringify(parsed)).toThrow(/__proto__/);
    expect(() => canonicalStringify({ a: { b: JSON.parse('{"__proto__": 1}') as unknown } })).toThrow(
      /__proto__/,
    );
  });

  it("keeps other prototype-ish keys intact (no silent drops)", () => {
    expect(canonicalStringify(JSON.parse('{"constructor": 1, "a": 2}'))).toBe(
      '{"a":2,"constructor":1}',
    );
  });

  it("rejects negative zero", () => {
    expect(() => canonicalStringify({ n: -0 })).toThrow(/Negative zero/);
    expect(canonicalStringify({ n: 0 })).toBe('{"n":0}');
  });

  it("rejects integers outside the IEEE-754 safe range", () => {
    expect(() => canonicalStringify({ n: 2 ** 53 })).toThrow(/safe range/);
    expect(() => canonicalStringify({ n: -(2 ** 53) })).toThrow(/safe range/);
    expect(canonicalStringify({ n: Number.MAX_SAFE_INTEGER })).toBe(
      `{"n":${Number.MAX_SAFE_INTEGER}}`,
    );
  });

  it("sorts keys by UTF-16 code unit, not code point (astral keys pinned)", () => {
    // U+10000 (surrogate pair, first unit 0xD800) sorts BEFORE U+FB00 in
    // UTF-16 code unit order, though its code point is higher.
    expect(canonicalStringify({ "ﬀ": 2, "\u{10000}": 1 })).toBe(
      '{"\u{10000}":1,"ﬀ":2}',
    );
  });

  it("is stable regardless of insertion order", () => {
    const a = canonicalStringify({ x: 1, y: [true, null], z: "s" });
    const b = canonicalStringify({ z: "s", y: [true, null], x: 1 });
    expect(a).toBe(b);
    expect(sha256HexUtf8(a)).toBe(sha256HexUtf8(b));
  });
});
