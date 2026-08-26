/**
 * Canonical JSON — the deterministic serialization every digest and
 * signature in the protocol is computed over.
 *
 * Rules (normative — see docs/protocol/evidence-protocol.md §6):
 * - Object keys sorted by UTF-16 code unit at every depth (the default
 *   ECMAScript string ordering). Note this differs from Unicode
 *   code-point order for astral-plane keys: a surrogate pair's first
 *   unit (0xD800–0xDBFF) sorts below BMP characters above it.
 * - Arrays serialized in place, order-significant.
 * - No insignificant whitespace; UTF-8 bytes of the resulting string.
 * - `undefined` object members are omitted (JSON.stringify semantics);
 *   `undefined` inside arrays is an error rather than a silent null.
 * - Non-finite numbers, BigInt, functions, and symbols are errors.
 * - Negative zero and integers outside the IEEE-754 safe range are
 *   errors — they cannot round-trip unambiguously.
 * - An own `"__proto__"` key is an error: ordinary assignment silently
 *   routes it to the prototype setter, so it cannot be represented
 *   faithfully and would otherwise vanish from the canonical bytes.
 * - Strings are NOT Unicode-normalized: producers must emit the exact
 *   code points they intend to sign. Numbers SHOULD be integers within
 *   the IEEE-754 safe range; fractional values are serialized with
 *   ECMAScript number-to-string, which conforming implementations must
 *   reproduce exactly (prefer strings for anything else).
 *
 * Duplicate-key caveat: JSON.parse silently keeps the last duplicate key,
 * so post-parse canonicalization cannot detect duplicates in the wire
 * form. Verifiers that need duplicate detection must scan the raw text
 * before parsing (`scanWireJson` in ./wire.ts; see the protocol spec's
 * security considerations).
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
    if (Object.is(v, -0)) {
      throw new Error(`Negative zero at ${path} is not canonical JSON (use 0, or a string).`);
    }
    if (Number.isInteger(v) && !Number.isSafeInteger(v)) {
      throw new Error(
        `Integer outside the IEEE-754 safe range at ${path} is not canonical JSON (use a string).`,
      );
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
    // Null prototype: no key ("constructor", …) can hit an inherited
    // accessor and be silently dropped from the canonical bytes.
    const out = Object.create(null) as { [key: string]: JsonValue };
    for (const key of Object.keys(v as object).sort()) {
      if (key === "__proto__") {
        throw new Error(
          `Own "__proto__" key at ${path} is not canonical JSON — it cannot be represented faithfully.`,
        );
      }
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
