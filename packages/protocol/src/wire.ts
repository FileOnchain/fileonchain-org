/**
 * Raw-text JSON wire checks — defenses that cannot run after parsing.
 *
 * JSON.parse keeps the last of duplicate keys silently (so a wire form
 * with two `"subject"` members verifies against the second while a human
 * reads the first) and materializes `"__proto__"` as an own property that
 * ordinary object construction then drops. Both must be caught in the raw
 * text. This scanner walks the document with a minimal tokenizer — string
 * escapes are decoded, so keys hiding inside string values or behind
 * `\uXXXX` escapes cannot fool it — and reports:
 *
 * - duplicate keys within a single object (the same key at different
 *   depths is fine), and
 * - any `"__proto__"` key, which canonicalization rejects outright.
 *
 * Syntax errors are NOT reported here: JSON.parse owns those. On the
 * first construct it cannot read past, the scanner stops quietly and
 * returns whatever problems it found up to that point.
 */

class MalformedJson extends Error {}

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);
const LITERAL_END = new Set([",", "}", "]", " ", "\t", "\n", "\r"]);
const ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};
const HEX4 = /^[0-9a-fA-F]{4}$/;

/**
 * Scan raw JSON text for duplicate keys within one object and for
 * `"__proto__"` keys. Returns the problems found; empty = clean wire
 * form (or malformed JSON, which JSON.parse reports instead).
 */
export const scanWireJson = (raw: string): string[] => {
  const problems: string[] = [];
  const n = raw.length;
  let i = 0;

  const bail = (): never => {
    throw new MalformedJson();
  };
  const skipWs = (): void => {
    while (i < n && WHITESPACE.has(raw[i])) i += 1;
  };
  const readString = (): string => {
    i += 1; // opening quote
    let out = "";
    while (i < n) {
      const c = raw[i];
      if (c === '"') {
        i += 1;
        return out;
      }
      if (c === "\\") {
        const e = raw[i + 1];
        if (e === "u") {
          const hex = raw.slice(i + 2, i + 6);
          if (!HEX4.test(hex)) bail();
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else {
          const decoded = e === undefined ? undefined : ESCAPES[e];
          if (decoded === undefined) bail();
          out += decoded;
          i += 2;
        }
      } else {
        out += c;
        i += 1;
      }
    }
    return bail();
  };
  const readValue = (path: string): void => {
    skipWs();
    if (i >= n) bail();
    const c = raw[i];
    if (c === "{") readObject(path);
    else if (c === "[") readArray(path);
    else if (c === '"') readString();
    else {
      // number / true / false / null — consumed as an opaque literal.
      const start = i;
      while (i < n && !LITERAL_END.has(raw[i])) i += 1;
      if (i === start) bail();
    }
  };
  const readObject = (path: string): void => {
    i += 1; // {
    const seen = new Set<string>();
    skipWs();
    if (raw[i] === "}") {
      i += 1;
      return;
    }
    for (;;) {
      skipWs();
      if (raw[i] !== '"') bail();
      const key = readString();
      if (key === "__proto__") problems.push(`forbidden key "__proto__" at ${path}`);
      if (seen.has(key)) problems.push(`duplicate key "${key}" at ${path}`);
      seen.add(key);
      skipWs();
      if (raw[i] !== ":") bail();
      i += 1;
      readValue(`${path}.${key}`);
      skipWs();
      if (raw[i] === ",") {
        i += 1;
        continue;
      }
      if (raw[i] === "}") {
        i += 1;
        return;
      }
      bail();
    }
  };
  const readArray = (path: string): void => {
    i += 1; // [
    skipWs();
    if (raw[i] === "]") {
      i += 1;
      return;
    }
    let index = 0;
    for (;;) {
      readValue(`${path}[${index}]`);
      skipWs();
      if (raw[i] === ",") {
        i += 1;
        index += 1;
        continue;
      }
      if (raw[i] === "]") {
        i += 1;
        return;
      }
      bail();
    }
  };

  try {
    readValue("$");
  } catch (error) {
    if (!(error instanceof MalformedJson)) throw error;
  }
  return problems;
};
