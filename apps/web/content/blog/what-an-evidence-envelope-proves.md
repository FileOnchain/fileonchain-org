---
title: What an evidence envelope proves
description: An evidence envelope binds a subject to claims, signatures, and receipts. Anyone can check it locally. It proves integrity, keys, and timing.
date: 2026-10-13
author: Marc-Aurèle Besner
tags: protocol, verifier
---

The page at [/verify](/verify) takes an evidence envelope and returns a status. The useful question is what that status is allowed to mean.

An evidence envelope is a portable JSON document. It binds a subject to claims about that subject, to signatures, and to receipts from outside systems. A conforming verifier checks the document on its own. The check does not call FileOnChain Cloud, and it does not ask for an account or a wallet.

Checked locally, an envelope proves existence, integrity, signing keys, and — through receipts — timing. A signed claim remains an assertion by the signer. The envelope does not establish that the subject is true, legally valid, or factually accurate. A signature establishes a key.

![Four cards labeled Subject, Claims, Signatures, and Receipts, captioned One evidence envelope.](/blog/images/what-an-envelope-proves-four-questions.jpg)

## Four questions, one document

The [Evidence Protocol](/protocol) keeps the envelope neutral. The subject may be a file, an agent run, a software release, a dataset, or something known only by its digest. Application meaning lives in a profile. The format of a receipt from a particular system lives in an adapter.

Four groups of fields answer four questions.

- **Subject.** What is this? At least one digest, or a URI. The type is one of `artifact`, `manifest`, `collection`, `event`, `resource`, or `abstract`. A media type, a size, a CID, or a display name may sit beside the digest. Those fields describe the subject. The digest is what a verifier recomputes.
- **Claims.** What is asserted about it? Claims are namespaced. The [Agent Evidence Profile](/agent-evidence) (`org.fileonchain.agent/v1`) is the first official profile. Under that profile a verifier expects a `runId` and an `agentId`, and it may also see model, tool-call, approval, and policy claims. A verifier that has never registered the profile still checks the rest of the envelope, and reports the profile as unknown.
- **Signatures.** Who stands behind it? Two kinds of signature answer two different questions, and the report keeps them apart.
- **Receipts.** What did an external system record? Every envelope carries three arrays — `storage`, `settlement`, and `inclusion` — and any of them may be empty.

```json
{
  "protocol": "fileonchain-evidence",
  "version": 1,
  "subject": {
    "type": "artifact",
    "digests": { "sha256": "…" }
  },
  "claims": {},
  "signatures": [],
  "receipts": {
    "storage": [],
    "settlement": [],
    "inclusion": []
  }
}
```

The file you hand someone is ordinary JSON. Digests and signatures are computed over a canonical encoding: object keys sorted by UTF-16 code unit, no insignificant whitespace, UTF-8. Two conforming implementations produce the same bytes for the same value. That is what makes a local check reproducible.

## Two signatures

An **artifact signature** answers who signed the subject and its claims. The signed payload is context-bound. It covers the protocol identifier, the version, the profile when one is set, the purpose, the scope, the subject, and the claims. A signature made under `org.fileonchain.agent/v1` fails if it is moved onto an envelope with a different profile, a different subject, or a different set of claims.

An **envelope signature** answers a later question: who assembled this complete envelope, receipts included? Finalization adds an envelope digest over the canonical envelope, excluding the `envelope` member itself. An envelope signature covers that digest. Adding, removing, or reordering a receipt changes the digest, and a signature over the previous digest no longer verifies.

An unsigned envelope can still be a well-formed document. It can show integrity, and its receipts can still carry time. It names no signer. The verifier reports that as a warning, which keeps authorship out of a document that has none.

![Two panels: an artifact signature over subject, claims, and profile, and an envelope signature over subject, claims, receipts, and digest.](/blog/images/what-an-envelope-proves-two-signatures.jpg)

## Receipts, and the clocks they belong to

`createdAt` on an envelope, and `signedAt` on a signature, are times the producer wrote down. A settlement receipt is a different kind of time. It records that a settlement system accepted a payload naming the digest. The adapter for that system defines the offline checks and, when you ask, the online checks against that system's public endpoints.

A storage receipt says a storage system was given a copy of the bytes. Storage is optional. Evidence can be the hash, the signatures, and the receipts alone, with the bytes left wherever they already live.

An inclusion receipt is a membership proof, typically a Merkle path. It means something when a settlement receipt anchors the same root. A self-consistent proof against a root that nothing anchors is membership in a tree anyone could have built.

Reading the bytes back still depends on the storage history remaining available. Finding a receipt quickly still normally means an indexer. The envelope is the document you check once you have it, and the verifier does not need the indexer to do that check.

## Unknown is a result

A verifier that meets an unregistered profile, or an unregistered adapter, reports that check as **unknown** and keeps the data. Unknown is a result. The schema, the digests, and the signatures the verifier knows how to check still run. A new profile, or a newly named settlement system, can travel inside an envelope before every verifier has heard of it.

The same rule covers identity. When a signature names a person or an organization, the verifier records the claim and marks the binding unknown. The cryptography showed that a key signed. Who holds the key is a separate question. Key revocation stays unknown from the envelope alone: the document may point at a key-status URL, and the URL has to be fetched to mean anything.

## What the status line is allowed to say

The reference verifier, `@fileonchain/verify`, returns one of four statuses. The same code runs in the browser on [/verify](/verify), in the `fileonchain` CLI, and in the in-process check shipped with the MCP server.

- **valid.** Every check passed. Nothing was left unknown or warned.
- **valid-with-warnings.** Nothing failed, and at least one check is a warning or unknown. This is the ordinary result for a signed envelope, because key status is reported as unknown.
- **incomplete.** Something essential is missing or unchecked. A draft — an envelope with no finalization block — is incomplete. Its receipts are not yet bound by an envelope digest.
- **invalid.** A check failed. A digest mismatch, a signature over the wrong payload, or a broken context binding lands here.

![Four verifier statuses — valid, valid-with-warnings, incomplete, and invalid — and the line Unknown is not a failure.](/blog/images/what-an-envelope-proves-statuses.jpg)

The order is fixed. Any failure makes the report `invalid`. A draft is `incomplete` even though the missing digest is also described with a warning. Warnings and unknowns, with no failure and no gap, produce `valid-with-warnings`.

The receipt on [/verify](/verify) uses that status as its heading. Artifact signatures and envelope signatures are separate lines. Unknown adapters and unknown profiles stay marked unknown.

## Check one on your own machine

[/verify](/verify) asks for no account and no wallet. Paste an envelope, or open the page with `?url=` or `?envelope=`. The samples on that page are the protocol's conformance fixtures, checked by the same verifier as anything you paste.

![A laptop showing a receipt headed valid-with-warnings, beside a file named .evidence.json, captioned Checked on this machine.](/blog/images/what-an-envelope-proves-local-check.jpg)

The CLI is that verifier:

```sh
fileonchain verify envelope.evidence.json --json
```

Pass `--artifact` with the subject bytes when you want the SHA-256 recomputed from the file in front of you. Pass `--online` when you want adapters to confirm receipts against public endpoints. Offline is the default. An online check you did not request is reported as skipped.

## What stays outside the envelope

Three layers stay distinct.

The protocol is neutral. It defines the envelope, the canonical bytes, the two signature payloads, and the rule that unknown profiles and adapters are preserved.

The Agent Evidence Profile is opinionated. It names the claims an agent run carries, and it does not require raw prompts. A prompt digest can commit to the instructions without publishing them.

FileOnChain Cloud is a hosted convenience: anchoring, API keys, and credits. Those fields stay in the hosted service. They are not members of a portable envelope. An envelope a stranger hands you remains checkable with the open verifier.

Locally verified evidence means the document's digests, keys, and receipts were checked. The claim inside the envelope remains the signer's assertion.
