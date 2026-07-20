/**
 * Canonical JSON — the deterministic serialization every digest and
 * signature in the protocol is computed over.
 *
 * Rules (normative — see docs/protocol/evidence-protocol.md §6):
 * - Object keys sorted by Unicode code point at every depth.
 * - Arrays serialized in place, order-significant.
 * - No insignificant whitespace; UTF-8 bytes of the resulting string.
 * - `undefined` object members are omitted (JSON.stringify semantics);
 *   `undefined` inside arrays is an error rather than a silent null.
 * - Non-finite numbers, BigInt, functions, and symbols are errors.
 * - Strings are NOT Unicode-normalized: producers must emit the exact
 *   code points they intend to sign. Numbers SHOULD be integers within
 *   the IEEE-754 safe range; fractional values are serialized with
 *   ECMAScript number-to-string, which conforming implementations must
 *   reproduce exactly (prefer strings for anything else).
 *
 * Duplicate-key caveat: JSON.parse silently keeps the last duplicate key,
 * so post-parse canonicalization cannot detect duplicates in the wire
 * form. Verifiers that need duplicate detection must scan the raw text
 * before parsing (see the protocol spec's security considerations).
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const canon = (v: unknown, path: string): JsonValue => {
  if (v === null) return null;
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) {
      throw new Error(`Non-finite number at ${path} is not canonical JSON.`);
    }
    return v;
  }
  if (Array.isArray(v)) {
    return v.map((item, i) => {
      if (item === undefined) {
        throw new Error(`undefined array element at ${path}[${i}] is not canonical JSON.`);
      }
      return canon(item, `${path}[${i}]`);
    });
  }
  if (typeof v === "object") {
    const out: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(v as object).sort()) {
      const item = (v as Record<string, unknown>)[key];
      if (item === undefined) continue; // match JSON.stringify member semantics
      out[key] = canon(item, `${path}.${key}`);
    }
    return out;
  }
  throw new Error(`Value of type "${typeof v}" at ${path} is not canonical JSON.`);
};

/** Serialize `value` to its canonical JSON string. Throws on non-JSON values. */
export const canonicalStringify = (value: unknown): string =>
  JSON.stringify(canon(value, "$"));
