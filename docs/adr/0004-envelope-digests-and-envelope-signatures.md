# ADR 0004 — Envelope digests and envelope signatures

**Status:** Accepted
**Date:** 2026-07

## Context

Artifact signatures deliberately cover only the signing context —
protocol identity, purpose, profile, subject, claims, scope — and
**exclude receipts**. They must: receipts are produced *after* signing
(a settlement transaction cannot exist before there is something
signed to settle), and each receipt is independently verifiable on its
own system, so re-collecting artifact signatures every time a receipt
arrives would be both impossible (the signer may be gone) and
pointless.

The consequence of that exclusion is a gap: nothing bound the
*assembled* envelope together. A receipt could be swapped for a weaker
one, dropped, or reordered; a claim edit plus fresh receipts could
masquerade as the original document. The legacy format
(`legacy-evidence-v1`) had exactly this gap — its receipts were not
cryptographically bound to the package.

## Decision

Add a finalization layer with two constructs:

1. **Envelope digest** — SHA-256 over the canonical JSON of the
   envelope **with the entire `envelope` member removed**, stored in
   `envelope.digest.sha256`. Everything else — subject, claims,
   artifact signatures, all receipts, extensions — is the digested
   region, so any post-finalization change (a receipt added, removed,
   reordered, or edited; a claim changed; a signature dropped) changes
   the digest.
2. **Envelope signatures** — signatures over a payload binding the
   protocol identity, the purpose `"envelope"`, and the envelope
   digest, stored in `envelope.signatures`. They answer a different
   question than artifact signatures: not *who signed the subject and
   claims* but *who assembled, exported, or approved this complete
   envelope, receipts included*.

The digest excludes the `envelope` member **by construction**: the
digest cannot cover itself (no recursion or fixpoint), and envelope
signatures — living inside the excluded member — can accumulate
without changing the digest or invalidating each other. Re-finalizing
after a content change drops envelope signatures whose payload digest
no longer matches, because they attest to a different envelope.

## Consequences

- Receipt substitution, removal, and reordering on a finalized
  envelope are detectable offline by recomputing one hash (verifier
  step 5).
- Two signature roles with distinct semantics: authorship/approval
  (artifact) vs assembly (envelope). Verifier reports keep them in
  separate check groups.
- Multiple parties can counter-sign the same assembled envelope
  (author's org, the exporting service) without coordination.
- Drafts (no `envelope` member) remain useful as working state but are
  reported *incomplete* — receipts not yet tamper-bound — pushing
  producers to finalize before distribution.
- Legacy packages, which predate the digest, are permanently flagged
  with a warning and a migration hint by the verifier.
