---
title: The bytes can stay where they are
description: Hash-only evidence is a complete envelope. A storage receipt is optional, and it records where a copy of the bytes lives, or that none was stored.
date: 2026-10-19
author: Marc-Aurèle Besner
tags: protocol, storage
---

An evidence envelope names a subject by its digest. The digest is what a verifier recomputes when the bytes are in hand. Building that document does not require sending the bytes to a storage system, to an external host, or to FileOnChain Cloud. The bytes can stay in the producer's custody, and the envelope is still a complete record of integrity, signing keys, and — when receipts are attached — timing.

[What an evidence envelope proves](/blog/what-an-evidence-envelope-proves) covers what a local check is allowed to mean. [Seal an agent run without publishing the prompt](/blog/seal-an-agent-run-without-publishing-the-prompt) applies the same idea inside agent claims, where a prompt digest travels and the prompt stays. This post is about the subject bytes themselves, and the receipt that says where a copy lives.

![A file card labeled archive.tar, captioned Stays with you, with a SHA-256 arrow into an evidence envelope listing a digest, signatures, and a settlement receipt.](/blog/images/bytes-stay-digest-travels.jpg)

## A location is a receipt

Storage is a per-subject choice. The [Evidence Protocol](/protocol) treats an envelope with an empty `storage` array as a complete document: the subject digest, the signatures, and any settlement receipts. Integrity is bound to the digest. A missing location makes the bytes harder to find. The digest, the signatures, and any settlement receipts still check.

That shape is the protocol default, because the material people want a tamper-evident record of is often material they do not want to publish: an unreleased build, a dataset, a contract, the output of a run. Moving the bytes turns the record into a disclosure. Writing them into a storage system's history makes the disclosure durable for as long as that history remains readable.

`createdAt` on the envelope is a time the producer wrote down. A settlement receipt is a different kind of time: a settlement system accepted a payload naming a digest. Neither one waits on a storage receipt.

## Three ways to record the choice

The reference verifier registers the adapter `fileonchain-storage/v1`. Its payload has three modes. Each mode is a claim about location, and the offline check treats them differently.

- **evidence-only.** The payload is `{ "mode": "evidence-only" }`. The check passes, with the detail that no bytes were stored and there is nothing to locate. This is an explicit record of the choice. An empty `storage` array is also valid, and it records no storage claim at all.
- **onchain-storage.** The payload carries a `fileonchain://<chainId>/<cid>` URI. The check passes when that URI parses, and the detail names the system. Reconstruction requires that system's history to be available. A URI that does not parse fails the check.
- **external-storage.** The payload carries a URI the producer already hosts, such as `ipfs://…` or `https://…`. The check is **unknown**. Availability depends on the provider. Integrity stays bound to the digest. A missing URI fails the check.

Unknown is a result, the same rule the verifier uses for an adapter it has never registered. The schema, the digests, and the signatures still run.

![Three cards labeled Evidence only, On-chain storage, and External URI, with the lines No copy stored, fileonchain://, and ipfs:// or https://. Caption: A storage receipt records a choice.](/blog/images/three-storage-receipts.jpg)

The creation flow on the site offers the same three choices: store the bytes on a storage system, link a URI you already host, or anchor the digest alone. After an anchor lands, the envelope the page builds uses `storageReceipt` in one of these three modes.

## What on-chain storage writes

On-chain storage embeds the subject bytes in chunk anchor payloads. Every family writes the same versioned JSON, so a stored file can be read back with the same parser. A chunk payload carries `op` set to `chunk`, the chunk CID, the file CID, an index, and a total. When the bytes are being stored, they ride along as a base64 `d` field.

```json
{
  "p": "fileonchain",
  "v": 1,
  "op": "chunk",
  "cid": "…",
  "fileCid": "…",
  "idx": 0,
  "total": 4,
  "d": "…"
}
```

Chunks are at most 64 KiB. How many raw bytes fit in one transaction depends on the family: the payload budget, the JSON around the data, and base64 expansion all come out of that budget. A transport that cannot fit a meaningful slice is refused for on-chain storage, so a small file is not split across a huge number of transactions.

The file anchor is written after the chunks. Indexers rely on that order. Its payload has `op` set to `anchor` and the file CID. When the bytes live on a different system from the one settling the digest, that payload's `uri` is the same `fileonchain://<chainId>/<fileCid>` pointer, so the settlement payload names the storage system. When one system does both jobs, the chunk payloads on that system carry the `d` field. The storage receipt still records the URI.

Autonomys mainnet (`substrate:autonomys-mainnet`) and Autonomys Taurus (`substrate:autonomys-taurus`) are the launch storage systems. Both are webapp-integrated, and their anchors embed chunk data. The [integrations](/integrations) page lists every network at its current status. Whether a transport can carry chunk bytes, and how far that network's integration has gone, are separate facts.

Reading the bytes back works provided that storage system's history is available. Finding the transactions quickly still normally means an indexer. The verifier checks the envelope without the indexer, and without fetching the file.

On-chain storage writes the bytes into a system's history. For a sensitive subject, encrypt the bytes before choosing it. The envelope then commits to the ciphertext's digest. The key stays with the people who should be able to read the plaintext.

## Settlement is a separate receipt

A settlement receipt records that a settlement system accepted a payload naming a digest. A storage receipt records where a copy of the bytes lives, or that none was stored. An envelope can carry either receipt, both, or neither.

Receipts from several settlement systems are multi-system settlement receipts. Each one says the digest was accepted on that system, at a time that system can speak for, and each one stands if another system is unavailable. They are independent attestations. The protocol has no notion of one system proving another's consensus.

A storage system and a settlement system can be the same network. They can also differ: chunk bytes on one system, a settlement receipt on another, joined by the `fileonchain://` URI. The verifier reports the two kinds of receipt in separate groups.

![Two columns. The storage column shows chunk payloads and a fileonchain URI. The settlement column shows a transaction naming the same digest. Caption: Two receipts, two questions.](/blog/images/storage-and-settlement.jpg)

## Building one

`@fileonchain/sdk/evidence` exposes `createEvidence` and `storageReceipt`. Passing the subject bytes hashes them into the subject descriptor. The bytes are not copied into the envelope.

```ts
import { createEvidence, storageReceipt } from "@fileonchain/sdk/evidence";

// subjectBytes and signer belong to the producer.
// signer is an EvidenceSigner: { signer, sign(payload) }.
const envelope = await createEvidence({
  subjectBytes,
  subjectMeta: { name: "archive.tar", mediaType: "application/x-tar" },
  signers: [signer],
  receipts: {
    storage: [storageReceipt({ mode: "evidence-only" })],
  },
});
```

Leaving `storage` empty is also valid. The envelope then carries no storage claim. The other two modes are opt-in, and each one names a place:

```json
{
  "mode": "onchain-storage",
  "uri": "fileonchain://substrate:autonomys-mainnet/bafyrei…"
}
```

```json
{
  "mode": "external-storage",
  "uri": "ipfs://bafyrei…",
  "provider": "ipfs"
}
```

An `onchain-storage` URI has to be a `fileonchain://` URI or the offline check fails. The helper can also record `chainId` and `txHashes` beside it. The check itself looks at `mode` and `uri`. An `external-storage` URI is the one you already use to host the bytes. `provider` is an optional label.

FileOnChain Cloud's anchoring API takes a CID, a file name, a size, and a chunk count. The subject bytes are not part of that request. Account ids, credits, and retention rules stay in the hosted service. They are not members of a portable envelope. An envelope a stranger hands you remains checkable with the open verifier.

Short, predictable content is a weak commitment. The digest of a tiny file drawn from a small set of candidates can be guessed by hashing the candidates. When the content is low-entropy, salt it or wrap it before hashing, and keep the salt with the bytes.

## What a relying party can retrieve

The party who holds the bytes can publish them later. Anyone can hash those bytes and compare them with the subject digest. Until that happens, the envelope says the subject had this digest. It says where to look only when a storage receipt says so.

- With **evidence-only**, or with no storage receipt, the relying party needs the bytes from the producer or from some other channel. `--artifact` on the verifier recomputes the digest from the file in front of them.
- With **external-storage**, they can request the URI themselves. The verifier reports availability as unknown. If they obtain bytes, the digest is the integrity check.
- With **onchain-storage**, reconstruction uses the chunk payloads on the named system, provided that system's history is available. The offline check confirms the URI. It does not download the file.

A URI that no longer resolves, or a history you cannot read, leaves the digest, the signatures, and any settlement receipts checkable. The integrity check remains. Retrieval is a separate convenience, and it depends on the copy still being there.

## Check one on your own machine

[/verify](/verify) takes the envelope and asks for no account and no wallet. The same verifier is the `fileonchain` CLI:

```sh
fileonchain verify archive.evidence.json --artifact archive.tar --json
```

`--artifact` recomputes the subject digest from the file in front of you. Offline is the default. The storage adapter's offline results are the ones above: a pass for evidence-only, a pass for a well-formed `fileonchain://` URI, unknown for an external URI. The adapter defines no online check. Pass `--online` and that gap is reported unknown, while adapters that do define an online check confirm their receipts against public endpoints. An adapter the verifier has never registered stays unknown, and the envelope is preserved.

![A laptop receipt headed valid-with-warnings beside a file card labeled archive.tar that sits outside the envelope. Caption: Checked on this machine.](/blog/images/bytes-stay-local-check.jpg)

Locally verified evidence means the document's digests, keys, and receipts were checked. A storage receipt says where a copy was claimed to live. The claim inside the envelope remains the signer's assertion. A signature establishes a key.
