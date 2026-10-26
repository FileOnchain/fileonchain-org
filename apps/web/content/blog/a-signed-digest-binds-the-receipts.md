---
title: A signed digest binds the receipts
description: Artifact signatures leave receipts out on purpose. The digest binds those receipts only once an envelope signature covers it.
date: 2026-10-26
author: Marc-Aurèle Besner
tags: protocol, verifier
---

An artifact signature answers who signed the subject and its claims. It stops there. Receipts are gathered afterward, and that signature has nothing to say when one of them is swapped, dropped, or reordered.

[What an evidence envelope proves](/blog/what-an-evidence-envelope-proves) separates the two signature lines and says what a local check is allowed to mean. [A settlement receipt names a transaction](/blog/a-settlement-receipt-names-a-transaction) covers what a settlement receipt records. [The bytes can stay where they are](/blog/the-bytes-can-stay-where-they-are) covers the storage receipt. This post is about the gap between the artifact signature and the receipts, and about the envelope digest that closes it.

Finalization stamps that digest. The stamp becomes evidence of the assembled document when an envelope signature covers it. Until then, anyone who can edit the envelope can recompute the hash.

![A card labeled Artifact signature covering Subject and Claims, marked Signed, beside three cards labeled Storage, Settlement, and Inclusion, marked Not covered. Caption: Artifact signatures leave receipts out.](/blog/images/finalize-receipt-gap.jpg)

## Receipts are left out on purpose

The [Evidence Protocol](/protocol) keeps receipts out of the artifact signing payload for a practical reason. A settlement transaction cannot exist before there is something to settle, so the receipt arrives after the artifact signature. Each receipt is checked on its own system. Collecting the artifact signature again every time a receipt arrives would require the signer to still be present, and it would repeat a signature whose meaning had not changed.

The cost of that exclusion is a gap. On an artifact signature alone, a weaker receipt can replace a stronger one, a receipt can disappear, and the array can be reordered. The signature still verifies, because its payload never included those arrays. The legacy format, `legacy-evidence-v1`, had this gap: its receipts were not cryptographically bound to the package.

The order that closes the gap is short.

1. Sign the artifact. The payload covers the protocol, the version, the purpose, the profile when one is set, the subject, the claims, and any scope.
2. Collect the receipts. Storage, settlement, and inclusion each have their own array, and any of them may be empty.
3. Stamp the envelope digest over the assembled document.
4. Sign that digest. The envelope signature is a different key's answer to a different question: who assembled this complete envelope, receipts included.

![Four cards in a row: Sign, with subject and claims; Collect, with storage, settlement, and inclusion; Stamp, with envelope digest; Sign, with envelope signature. Caption: Receipts land between the two signatures.](/blog/images/finalize-four-steps.jpg)

`createEvidence` in the reference SDK does the first three. It signs the artifact, places the receipts you pass in, and finalizes. It leaves `envelope.signatures` empty. `signEnvelope` is the fourth step. The same signer may be passed to both calls. The two signatures still answer different questions, and the report keeps them in different groups.

## What the digest covers

The envelope digest is the SHA-256, as 64 lowercase hex characters, of the canonical JSON of the envelope with the entire `envelope` member removed. Canonical JSON sorts object keys by UTF-16 code unit at every depth, keeps array order, and emits no insignificant whitespace. The hash is over those UTF-8 bytes. Two conforming implementations produce the same digest for the same value.

Everything else is the digested region: `protocol`, `version`, `id`, `profile`, the subject, the claims, the artifact signatures, all three receipt arrays in order, extensions, and `createdAt`. Adding, removing, reordering, or editing any of that changes the digest.

The finalization block sits outside that region:

```json
{
  "envelope": {
    "digest": { "sha256": "…" },
    "signatures": []
  }
}
```

The exclusion is what makes the construction work. The digest cannot cover itself, so there is no fixpoint to solve. Envelope signatures live in the excluded member, so a second assembler can counter-sign the same digest without changing it and without invalidating the first signature.

An envelope signature signs a small payload, itself canonical JSON:

```json
{
  "protocol": "fileonchain-evidence",
  "version": 1,
  "purpose": "envelope",
  "envelopeDigest": { "sha256": "…" }
}
```

`payloadDigest` on the signature is the SHA-256 of that payload. The verifier recomputes it from the digest stored on the envelope and fails the signature when the two differ.

![A region labeled Digested region listing protocol, subject, claims, artifact signatures, receipts, and extensions, with a SHA-256 arrow to a finalization block holding envelope.digest and envelope signatures. Caption: The digest covers everything except the finalization block.](/blog/images/finalize-digested-region.jpg)

Extensions are inside the digest and outside the artifact signing payload. A migration note, or any other extension, can be added without breaking the artifact signature. It does change the envelope digest, so a previous envelope signature no longer matches and has to be made again.

`finalizeEnvelope` is the function that restamps. It recomputes the digest and drops envelope signatures whose `payloadDigest` no longer matches. Those signatures attest to a different envelope. Keeping them would make the verifier fail the signature line.

> An unsigned digest catches an accident. Anyone who can edit the envelope can write a new digest to match.

## What the digest line reports

The reference verifier, `@fileonchain/verify`, treats the digest check as one line in the `envelope` group. The same code runs on [/verify](/verify), in the `fileonchain` CLI, and in the in-process check shipped with the MCP server. The line comes out one of four ways.

- **Draft.** There is no `envelope` member. The check is a warning: "draft envelope — no envelope digest; receipts are not yet tamper-bound." The overall status is **incomplete**. A draft is a working copy. Its receipts are not yet bound.
- **Digest mismatch.** The stored `envelope.digest.sha256` differs from the digest just computed. The check fails, and the overall status is **invalid**. The content changed after finalization.
- **Matching digest, no valid envelope signature.** The stored digest equals the computed one, and nobody has signed it. The check is a warning: the digest is self-consistent and unsigned, and it does not protect against modification by anyone who can recompute it. When the signatures array is empty, a second line is **unknown**: nobody attests to the assembled envelope as a whole. The overall status is **valid-with-warnings**. The document is finished enough to check. The binding against an editor is missing.
- **Matching digest, signed.** At least one envelope signature over that digest verifies. The check passes. The detail says the digest is covered by that many valid envelope signatures, and that receipts cannot have been added, removed, or reordered without invalidating them.

A signature whose `payloadDigest` does not match this envelope, or whose cryptography does not verify, fails that signature line. Any failed check makes the overall status **invalid**.

![Three cards: Draft marked Incomplete, with the line No digest yet; Unsigned digest marked Warning, with the line Anyone can recompute it; Signed digest marked Pass, with the line A signature covers it. Caption: A matching digest is not enough.](/blog/images/finalize-three-outcomes.jpg)

A passing digest line leaves the rest of the report as it was. Key status is reported unknown from the envelope alone, and that is enough to keep a signed envelope at **valid-with-warnings**. The [first post](/blog/what-an-evidence-envelope-proves) is the map of the four statuses. This post is about what the digest line is allowed to say.

`signedAt` on either signature, and `createdAt` on the envelope, stay times the producer wrote down. A settlement receipt is the other clock. The digest binds the receipt into the document. It does not promote the producer's clock into the settlement system's clock.

## Two keys, two questions

The usual split is two roles. The author of a software release signs the artifact: the tarball, or the manifest, and the claims about it. The build system that gathered the settlement receipts and exported the file signs the envelope. The same split fits a document: the signers of the subject sign the artifact, and the service that assembled the receipts signs the envelope. In both cases a signature establishes a key. It does not establish legal authorship, and it does not make the claims true.

Several envelope signatures may sit on the same digest: the author's organization, and the service that exported the file. They do not coordinate, and they do not invalidate one another. Distinct envelopes over the same subject, with different signer sets, are both valid documents. The report says who signed what.

## After a change, finalize again

`signEnvelope` finalizes a draft when no finalization block is present, then signs the digest stored on the envelope. It does not recompute a digest that is already there. If a receipt was edited after `createEvidence` returned, call `finalizeEnvelope` before signing. The new signature would otherwise cover the old digest, and the verifier would fail the digest line.

```ts
import {
  createEvidence,
  signEnvelope,
  settlementReceiptFromAnchor,
} from "@fileonchain/sdk/evidence";

// author and assembler are EvidenceSigner values: { signer, sign }.
// The author's signature covers the subject and the claims.
const finalized = await createEvidence({
  subjectBytes,
  subjectMeta: { name: "archive.tar", mediaType: "application/x-tar" },
  signers: [author],
  receipts: {
    settlement: [
      settlementReceiptFromAnchor({
        chainId: "evm:11155111",
        txHash: "0xabc…",
        blockNumber: 123,
      }),
    ],
  },
});

// The digest is stamped. envelope.signatures is still empty.
// This call covers that digest, receipts included.
const envelope = await signEnvelope(finalized, [assembler]);
```

The chain id is only the settlement system that receipt names. A storage receipt and an inclusion receipt sit in the same hashed region, and editing either one changes the digest the same way.

## A legacy package still has the old gap

A `legacy-evidence-v1` package has no envelope digest. The verifier warns that its receipts are not cryptographically bound to the package, and it names migration. `fileonchain migrate` converts the package and stamps a digest over the converted document. The original signatures signed a different payload, so they are kept in an extension and are not protocol artifact signatures. The new digest is unsigned until an envelope signature is added. Migration writes that finalized envelope. The signature that makes the digest line pass is still a separate act.

## What to hand someone

Hand someone a finalized envelope with at least one envelope signature from a key they recognize, when receipt completeness matters to them. A draft is the right shape while receipts are still arriving. An unsigned digest is the right shape for a file you are still editing. Neither one is the document that binds the receipts.

```sh
fileonchain verify archive.evidence.json --json
```

The report's envelope group is the line to read. [/verify](/verify) runs the same check in the browser, with no account and no wallet.

Locally verified evidence is that report. A signed envelope digest says the subject, the claims, the artifact signatures, and the receipts were bound together under the key that signed it. The claims remain assertions by their signers. A signature establishes a key.
