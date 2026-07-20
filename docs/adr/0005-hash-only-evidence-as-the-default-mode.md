# ADR 0005 — Hash-only evidence as the default mode

**Status:** Accepted
**Date:** 2026-07

## Context

Evidence workflows constantly touch sensitive material: agent prompts
and tool payloads, legal documents, unreleased builds, personal data in
research datasets. Any default that moves bytes — to a chain, to a
storage provider, to FileOnChain Cloud — turns "create a tamper-evident
record" into a disclosure decision, and on-chain storage makes it an
*irreversible* one. Meanwhile the protocol's guarantees (integrity,
attribution, timing) need only digests: SHA-256 commitments verify
bytes wherever they are, and canonical signing payloads are computed
over descriptors and claims, not content.

## Decision

**Hash-only is the default everywhere.**

- An envelope with zero storage receipts is fully valid: subject
  digest, signatures, settlement receipts — the bytes never leave the
  producer's custody.
- Storage is an explicit, per-subject opt-in with three receipt modes
  (`evidence-only`, `onchain-storage`, `external-storage`); the
  default is `evidence-only`.
- The Agent Evidence Profile extends the posture to claims: prompt
  *digests* not prompts, tool input/output *digests* not payloads,
  trace *references and digests* not trace bodies. Raw prompts are
  never required.
- FileOnChain Cloud's API is hash-only by default: requests carry
  digests/CIDs; artifact bytes are transmitted only when a caller
  explicitly selects a byte-moving storage mode.

## Consequences

- Privacy incidents cannot be caused by the default path — there is
  nothing to leak but digests and whatever claims the producer chose
  to write.
- Selective disclosure works naturally: the holder can later reveal
  the bytes (or a prompt, or a tool payload) and anyone can check them
  against the committed digest.
- The cost of the default is availability: hash-only evidence proves
  integrity of bytes the relying party must obtain elsewhere. Storage
  receipts exist precisely for the cases that need retrievability.
- Digests of low-entropy content are guessable commitments
  (dictionary attack on the preimage); producers hashing predictable
  short content should salt or wrap it — a documented caveat, not a
  protocol mechanism.
- Product copy must never equate FileOnChain with "storing your files
  on-chain"; storage is a feature, evidence is the product.
