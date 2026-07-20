# ADR 0003 — Canonical JSON over a binary canonical format

**Status:** Accepted
**Date:** 2026-07

## Context

Every digest and signature in the protocol needs a deterministic byte
representation of structured data. The candidates were a binary
canonical format (CBOR with deterministic encoding rules, or a custom
TLV) and canonical JSON (sorted keys, no whitespace, UTF-8).

Binary formats have real advantages: no duplicate-key ambiguity by
construction, well-defined numeric encodings, smaller payloads. But
evidence is a debugging-heavy artifact class — developers diff
envelopes, paste them into issues, inspect them in editors, and verify
them by eye before trusting tooling — and the whole stack (SDK,
verifier, fixtures, hosted API) already speaks JSON.

## Decision

Protocol version 1 computes all digests and signing payloads over
**canonical JSON**: object keys sorted by Unicode code point at every
depth, arrays in place, no insignificant whitespace, UTF-8 bytes;
`undefined` members omitted, `undefined` array elements and non-finite
numbers rejected; strings not Unicode-normalized; numbers preferably
safe-range integers, with fractional values serialized by the
ECMAScript number-to-string algorithm. Reference:
`canonicalStringify` in `packages/protocol/src/canonical.ts`; normative
rules in the spec's §6.

The interchange form stays ordinary human-readable JSON; only hashing
and signing normalize. A compact **binary canonical representation
remains a documented candidate for a future protocol version** —
version 1 deliberately chooses debuggability now.

## Consequences

- Envelopes are inspectable, diffable, and fixable with nothing but a
  text editor; conformance fixtures are readable test vectors.
- Two caveats are inherited and must be documented and mitigated
  (spec §16.1):
  - **Duplicate JSON keys** — standard parsers keep the last duplicate
    silently, so post-parse canonicalization cannot detect them;
    producers must never emit duplicates and strict verifiers should
    scan the raw text.
  - **Numbers** — cross-language implementations must reproduce
    ECMAScript number-to-string exactly for fractional values, so
    producers are steered toward safe-range integers and strings.
- Strings are signed as exact code points (no NFC/NFD normalization),
  trading "same-looking strings digest the same" for implementation
  simplicity and determinism.
- If a future version adopts a binary canonical form, it arrives as a
  protocol version bump, not a silent re-interpretation of version 1.
