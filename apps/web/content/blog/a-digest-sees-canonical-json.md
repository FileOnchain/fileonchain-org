---
title: A digest sees canonical JSON
description: Pretty-printed JSON is the interchange file. Digests and signatures are SHA-256 of canonical JSON: sorted keys, no whitespace, UTF-8.
date: 2026-11-02
author: Marc-Aurèle Besner
tags: protocol, verifier
---

The JSON you hand someone may be pretty-printed. Its keys may sit in the order an editor wrote them. That document is the interchange form. When the protocol hashes the document, or a signing payload, it hashes a different byte string: canonical JSON.

A subject digest is still the hash of the artifact bytes. Canonical JSON is how the structured document around that digest becomes bytes a signature can cover.

[A signed digest binds the receipts](/blog/a-signed-digest-binds-the-receipts) says what the envelope digest covers, and when that coverage becomes a pass. [What an evidence envelope proves](/blog/what-an-evidence-envelope-proves) says what a local check is allowed to mean. This post is the encoding under both.

![Left card titled Interchange file showing pretty-printed JSON with keys out of order, right card titled Canonical bytes showing one compact sorted line, with an arrow labeled canonical JSON and a SHA-256 pill. Caption: The hash is over the canonical bytes.](/blog/images/canonical-pretty-vs-bytes.jpg)

## The rules

The envelope digest and both signing payloads are each the SHA-256 of one canonical string, written as 64 lowercase hex characters. The hash input is the UTF-8 bytes of that string. The reference function is `canonicalStringify` in `@fileonchain/protocol`. The spec requires two conforming implementations to emit the same string for the same value.

Object keys are sorted by UTF-16 code unit at every depth. That is ordinary ECMAScript string order. Arrays stay in the order they were written, and that order is significant. An object nested inside an array is still sorted. The string contains no insignificant whitespace. An object member whose value is absent is omitted. An absent element inside an array is an error, and it is not rewritten as `null`. Strings are left in the normalization form the producer emitted. The code points in the string are the code points that get signed.

```json
{"a":{"c":3,"d":2},"b":1}
```

That is `canonicalStringify` of an object written as `b`, then `a` holding `d` and `c`. Insertion order does not survive. An array is different. `canonicalStringify` of `{ list: [{ z: 1, y: 2 }, 3] }` is:

```json
{"list":[{"y":2,"z":1},3]}
```

The array stays in place. The object inside its first element sorts.

![A before-and-after diagram. An object written as b, then a containing d and c, becomes a containing c and d, then b. Below, an array stays in order while the object in its first element sorts y before z. Caption: Keys sort at every depth. Arrays stay in place.](/blog/images/canonical-keys-and-arrays.jpg)

The sort is the rule other languages have to copy exactly. Comparison walks UTF-16 code units, which differs from Unicode code-point order for keys outside the basic multilingual plane. A key whose first unit is a surrogate (U+D800 through U+DBFF) sorts below a BMP character above that unit, even when the key's code point is higher. The case pinned in the protocol tests is U+10000 before U+FB00. Code-point order would reverse those two keys. An implementation that sorts by code point disagrees with the reference verifier on them, and the disagreement is a digest mismatch.

## What the encoder refuses

Some values have no single JSON form that round-trips. `canonicalStringify` throws on them instead of picking a quiet default.

- `undefined` on an object is omitted, the same way `JSON.stringify` omits it. `undefined` inside an array throws.
- `Infinity`, `-Infinity`, and `NaN` throw. Functions, symbols, and `BigInt` throw.
- Negative zero throws. `0` and `-0` compare equal, and ordinary JSON writes both as `0`, so a digest could not tell them apart after a round trip. Emit `0`, or a string.
- An integer outside the safe range throws. Safe integers run from −(2^53 − 1) through 2^53 − 1. The value 2^53 is not in that range. Put it in a string.
- An own key `"__proto__"` throws. Ordinary object construction sends that key to the prototype setter, and the member would vanish from the canonical bytes.

Fractional numbers are serialized with the ECMAScript number-to-string algorithm. Another language has to reproduce that algorithm, or the same value digests differently. A safe integer, or a string, avoids that coupling.

The spelling of a number in the file is not what gets hashed. After parsing, `1`, `1.0`, and `1e0` are the same value, and the canonical form is `1`. The check parses first, then canonicalizes the value.

## Duplicate keys fail first

Canonicalization runs on a parsed value. A standard JSON parser keeps the last of two identical keys and drops the earlier one, so the encoder never sees the key a person read first. Two documents that differ only in a shadowed key become one value and one digest.

The reference verifier rejects that document before any digest is computed. `verifyEvidenceJson` — the check on [/verify](/verify), in `fileonchain verify`, and in the MCP server — parses the text, then scans the raw text with `scanWireJson`. A duplicate key within one object fails a check named `wire-form`, in the `schema` group. The detail starts with "unsafe JSON wire form". Any failed check makes the overall status **invalid**.

The same key at two depths is allowed. Key-like text inside a string value is not a key. Escapes are decoded before the comparison, so the key `"\u0061"` and the key `"a"` are one key, and a document that uses both fails the scan.

A `"__proto__"` key fails the same check, written plainly or as an escape. `parseEnvelope` applies the same scan and returns null, so the text never becomes an envelope a later step could hash.

![A JSON card with two subject keys, the first marked as what a person reads and the second marked as what a parser keeps. An arrow labeled scanWireJson leads to a failed wire-form check, and a digest card sits greyed out beyond it. Caption: Duplicate keys fail before a digest is computed.](/blog/images/canonical-wire-scan.jpg)

Two further differences hide in text that looks interchangeable.

**Unicode form.** The single code point U+00E9 and the sequence "e" followed by the combining acute U+0301 look alike. They are different strings, and `canonicalStringify` emits different bytes for them. The protocol leaves both forms alone. A normalizer would be another place two implementations diverge. A display that folds the two forms together hides a real difference in the digest.

**A clean reformat leaves the digest alone.** Reordering keys, or adding spaces and newlines, does not change a digest. The check parses the document and canonicalizes the value. Reformatting a file so a reviewer can read it leaves the digests alone. Shadowing a key fails the wire check.

## One encoding, three payloads

`canonicalStringify` is the encoding. Three payloads pass through it, and they are three different objects.

The artifact signing payload binds the protocol identifier `fileonchain-evidence`, version `1`, the purpose (the default is `"artifact"`), the profile when one is set, the subject, the claims when any are present, and the scope when one is set. With a subject and no profile, claims, or scope, the canonical string is:

```json
{"protocol":"fileonchain-evidence","purpose":"artifact","subject":{"digests":{"sha256":"…"},"type":"artifact"},"version":1}
```

Receipts are absent from that payload. [A signed digest binds the receipts](/blog/a-signed-digest-binds-the-receipts) explains why, and what closes the gap.

The envelope digest is the SHA-256 of the canonical JSON of the envelope with the entire `envelope` member removed. The digested region is everything else: `protocol`, `version`, `id`, `profile`, the subject, the claims, the artifact signatures, the three receipt arrays in order, extensions, and `createdAt`. Whitespace around those fields in the interchange file does not move the digest. Editing a value does.

The envelope signing payload is smaller. Its canonical string is:

```json
{"envelopeDigest":{"sha256":"…"},"protocol":"fileonchain-evidence","purpose":"envelope","version":1}
```

`payloadDigest` on an envelope signature is the SHA-256 of that string. The verifier rebuilds the string from the digest stored on the envelope and fails the signature when the recorded `payloadDigest` differs.

![Three cards labeled Artifact payload, Envelope digest, and Envelope signing payload, each with an arrow into one shared box labeled Canonical JSON, then an arrow to SHA-256. Caption: One encoding, three payloads.](/blog/images/canonical-three-payloads.jpg)

A later protocol version could define a binary canonical form. Version 1 keeps the interchange document as JSON a person can diff and paste. The hash is the step that normalizes. A binary form would arrive as a version bump, leaving version 1 documents on these rules.

## What the check reports

Hand the document to [/verify](/verify). The same function, `verifyEvidenceJson`, runs in the browser, in the `fileonchain` CLI, and in the in-process MCP check.

- **Not JSON.** Parsing throws. The schema check fails with "not valid JSON", and the status is **invalid**. The wire scanner is only run on text that parsed.
- **A duplicate key, or a `"__proto__"` key.** The `wire-form` check fails, and the status is **invalid**.
- **A readable document.** Key order and whitespace drop out during canonicalization. Stored digests are compared with digests recomputed from the parsed value. What the envelope-digest line is allowed to say — draft, mismatch, unsigned match, signed match — is the subject of the [signed-digest post](/blog/a-signed-digest-binds-the-receipts).

The encoder's refusals — negative zero, an unsafe integer, a non-finite number — are enforced when a producer calls `canonicalStringify`. The reference SDK builds envelopes through that function, so those values stop before a document is written.

Canonical JSON makes the local check reproducible. It leaves the meaning of the claims to the signer who asserted them. A signature establishes a key.
