# ADR 0006 — Adapter-based storage and settlement receipts

**Status:** Accepted
**Date:** 2026-07

## Context

The legacy format hardcoded chain concepts into the core schema:
settlement receipts had `chainId`, `txHash`, `blockNumber`,
`blockHash` as first-class fields, and storage receipts knew about
FileOnChain's own `fileonchain://` URIs and chain registry. That
coupled the evidence format to blockchains generally and to
FileOnChain's chain registry specifically. Every new receipt source —
an RFC 3161 timestamping authority, a transparency log, a new chain
family with a different transaction model — would have meant core
schema changes and a lockstep upgrade of every implementation.

## Decision

The core schema defines only a generic receipt shell, and **no
chain-specific (or any system-specific) field exists in the core**:

```json
{ "type": "storage|settlement|inclusion", "adapter": "<name>/v<major>", "system": "…", "payload": { … } }
```

- `adapter` names the receipt format; the adapter's own specification
  owns the payload schema, offline checks, online checks, finality
  behavior, and error states.
- `system` identifies the external system where applicable; it is
  required for settlement receipts. For blockchains, **CAIP-2
  identifiers** are used (`eip155:11155111` for Sepolia), giving
  chain-agnostic tooling a standard vocabulary instead of a
  FileOnChain-private one; non-CAIP systems use stable namespaced ids.
- Verifiers consult an adapter registry; a receipt whose adapter is
  not registered is reported **unknown, never failed**, and preserved
  byte-for-byte.
- The reference verifier ships built-ins: `fileonchain-merkle/v1`
  (inclusion), `fileonchain-evm-anchor/v1` and `fileonchain-anchor/v1`
  (settlement), `fileonchain-storage/v1`, and the legacy adapters the
  migration tool emits.

## Consequences

- New receipt sources are new adapters — a package registering with
  `registerAdapter` — with zero core schema churn and no coordination
  with other implementations.
- Old envelopes never break: a verifier that predates an adapter
  reports its receipts unknown rather than rejecting the envelope.
- The core protocol makes no blockchain assumption at all; "settlement
  system" genuinely means any system that can fix a digest at a time.
- Verification quality becomes adapter-dependent: the overall result
  can be `valid-with-warnings` simply because a receipt's adapter is
  absent. This is accepted as the honest representation.
- Adapter identifiers are major-versioned (`name/vN`); breaking
  payload changes mint a new id rather than mutating an existing one.
- Legacy `chainId` values migrate to systems via a fixed rule (EVM →
  CAIP-2 `eip155:<id>`; other families keep the FileOnChain-namespaced
  form until CAIP coverage justifies a v2 adapter).
