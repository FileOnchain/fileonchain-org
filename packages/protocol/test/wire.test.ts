import { describe, expect, it } from "vitest";
import { buildEnvelope, parseEnvelope, scanWireJson, sha256HexUtf8 } from "../src/index";

describe("scanWireJson", () => {
  it("flags duplicate keys within one object", () => {
    expect(scanWireJson('{"a": 1, "a": 2}')).toEqual(['duplicate key "a" at $']);
    expect(scanWireJson('{"outer": {"x": 1, "x": 2}}')).toEqual(['duplicate key "x" at $.outer']);
  });

  it("allows the same key at different depths", () => {
    expect(scanWireJson('{"a": {"a": 1}, "b": [{"a": 2}, {"a": 3}]}')).toEqual([]);
  });

  it("is not fooled by keys inside string values", () => {
    expect(scanWireJson('{"a": "{\\"a\\": 1}", "b": "\\"a\\":"}')).toEqual([]);
  });

  it("decodes escapes before comparing keys", () => {
    expect(scanWireJson('{"a": 1, "\\u0061": 2}')).toEqual(['duplicate key "a" at $']);
  });

  it("flags __proto__ keys, plainly written or escaped", () => {
    expect(scanWireJson('{"__proto__": {"polluted": true}}')).toEqual([
      'forbidden key "__proto__" at $',
    ]);
    expect(scanWireJson('{"nested": {"\\u005f_proto__": 1}}')).toEqual([
      'forbidden key "__proto__" at $.nested',
    ]);
  });

  it("stays quiet on malformed JSON (JSON.parse owns syntax errors)", () => {
    expect(scanWireJson('{"a": ')).toEqual([]);
    expect(scanWireJson("not json")).toEqual([]);
  });
});

describe("parseEnvelope wire safety", () => {
  const envelope = buildEnvelope({
    subject: { type: "artifact", digests: { sha256: sha256HexUtf8("wire") } },
    createdAt: "2026-07-11T12:00:00Z",
  });
  const raw = JSON.stringify(envelope);

  it("accepts a clean wire form", () => {
    expect(parseEnvelope(raw)).not.toBeNull();
  });

  it("rejects a wire form with a duplicate top-level key", () => {
    const duplicated = raw.replace(
      '"protocol":"fileonchain-evidence"',
      '"protocol":"fileonchain-evidence","protocol":"fileonchain-evidence"',
    );
    expect(duplicated).not.toBe(raw);
    expect(parseEnvelope(duplicated)).toBeNull();
  });

  it("rejects a wire form carrying a __proto__ key", () => {
    const polluted = `{"__proto__":{"polluted":true},${raw.slice(1)}`;
    expect(parseEnvelope(polluted)).toBeNull();
  });
});
