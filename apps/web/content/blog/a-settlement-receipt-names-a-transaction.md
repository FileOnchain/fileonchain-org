---
title: A settlement receipt names a transaction
description: A settlement receipt records that a system accepted a payload naming a digest. Offline, the hash is a pointer. An online EVM check binds the transaction.
date: 2026-10-22
author: Marc-Aurèle Besner
tags: protocol, verifier
---

An evidence envelope can carry two kinds of time. `createdAt` on the envelope, and `signedAt` on a signature, are times the producer wrote down. A settlement receipt is the other kind. It records that a settlement system accepted a transaction whose payload names a digest.

[What an evidence envelope proves](/blog/what-an-evidence-envelope-proves) covers what a local check is allowed to mean. [The bytes can stay where they are](/blog/the-bytes-can-stay-where-they-are) covers the storage receipt: where a copy of the bytes lives, or that none was stored. [Seal an agent run without publishing the prompt](/blog/seal-an-agent-run-without-publishing-the-prompt) covers digest claims inside an agent run. This post is about the settlement receipt, and about what the reference verifier reports before it has read the transaction.

![Two cards. The left is labeled createdAt with the time 2026-10-22T07:00:00Z, captioned Written by the producer. The right is a settlement receipt with a transaction hash and a block time, captioned Recorded by the system. Caption: Two kinds of time.](/blog/images/settlement-two-clocks.jpg)

## Two clocks

A signature establishes a key. A digest establishes integrity when the bytes are in hand. Neither one says when a public system first accepted a payload that names the subject. That is the settlement receipt's job.

The receipt records a transaction. It leaves the truth of the subject, its legal validity, and its factual accuracy as they were: assertions by the signer, when there is a signer. A time the producer typed into `createdAt` stays the producer's clock. The settlement system's clock is the block the transaction landed in, and only a check that reads the transaction can speak for it.

> A transaction hash written into the envelope is a pointer. The binding is what the transaction itself says.

## A shell, and an adapter

The [Evidence Protocol](/protocol) keeps chain fields out of the core schema. Storage, settlement, and inclusion receipts share one shell. `type`, `adapter`, and `payload` are the common members. `system` is required on a settlement receipt and optional on the others.

```json
{
  "type": "settlement",
  "adapter": "fileonchain-evm-anchor/v1",
  "system": "eip155:11155111",
  "payload": {
    "chainId": "evm:11155111",
    "txHash": "0x…",
    "blockNumber": 123
  }
}
```

`adapter` names the format and the checks, including a major version. The reference helper `settlementReceiptFromAnchor` writes `fileonchain-evm-anchor/v1` for an EVM chain and `fileonchain-anchor/v1` for every other family. The payload shape is the same either way: `chainId`, `txHash`, and any of `blockNumber`, `blockHash`, `timestamp`, the anchor payload string, and a `submitter`.

`system` identifies the settlement system. For EVM, the helper writes a CAIP-2 identifier: `eip155:` plus the chain reference, so Ethereum Sepolia (`evm:11155111`) is `eip155:11155111`. For other families it writes the FileOnChain chain id, such as `substrate:autonomys-mainnet` or `solana:mainnet`.

![A settlement receipt card with the rows type settlement, adapter evm-anchor/v1, and system eip155:11155111, plus an inner box reading Owned by the adapter. Caption: A shell. The payload belongs to the adapter.](/blog/images/settlement-receipt-shell.jpg)

The payload belongs to the adapter. A new settlement system is a new adapter, registered with `registerAdapter`. The envelope schema stays put. A verifier that has never registered the adapter reports that receipt **unknown** and keeps the data. Unknown is a result. The digests and the signatures the verifier knows how to check still run.

## Offline, the hash is a pointer

The offline check looks for a `txHash`. A missing or empty one fails the check. A present one does not pass it.

The status is **unknown**. The detail says the check is structure only, and that the on-chain binding was not verified offline. When the chain is in the registry, the detail includes an explorer URL for that transaction. When the system is unknown to the registry, the detail says the system is unknown.

A hash in a JSON document is a claim that a transaction exists. The offline verifier does not fetch it, so it does not learn whether the transaction succeeded, which block it sits in, or whether the payload names this subject. A `timestamp` copied into the payload is part of that claim. It is a value the producer stored beside the hash. The online EVM check, when you ask for it, confirms the block number the receipt states. It does not treat that payload timestamp as the system's clock.

A settlement line on an otherwise clean report is unknown. Key status is unknown from the document alone, for the reason the [earlier post](/blog/what-an-evidence-envelope-proves) describes. With nothing failed, the report is `valid-with-warnings`.

## What an online check reads

[/verify](/verify) has a checkbox, off by default, that confirms receipts online. The CLI is the same switch. Offline remains the default, and an online check you did not request is reported as skipped.

```sh
fileonchain verify archive.evidence.json --online --json
```

On an EVM system the reference adapter fetches the transaction and its receipt. It uses the public endpoint on the chain entry, unless the caller passed an endpoint for that system id or chain id. The CLI flag uses the public endpoint. A passing check has all of the following.

- The transaction hash is 32 bytes of hex.
- The receipt status is success.
- When the settlement receipt names a block number, it matches the block the chain reports.
- The calldata decodes as a FileRegistry `anchorChunk` or `anchorCID` call. File-level anchors go through `anchorChunk` on every deployed registry generation, and the checker accepts both entrypoints.
- The `uri` argument parses as a fileonchain anchor payload with `op` set to `anchor` or `chunk`.
- That payload references the subject's SHA-256, the subject's CID, or the root of an inclusion receipt on this envelope. A file anchor parses when `cid` is a CID, and it matches on `cid` or `sha256`. A chunk anchor parses when `cid` and `fileCid` are CIDs, and it matches on those two fields. A Merkle root is a SHA-256, so the match for a root is the file anchor's `sha256`.

A reverted transaction, a block mismatch, calldata that is not one of those calls, a `uri` that does not parse, or a payload that names something else fails the check. A hash that is not 32-byte hex fails it too. An endpoint error is **unknown**. When the envelope offers no CID, SHA-256, or inclusion root to bind against, a decoded payload is **unknown** as well: the checker reports what the transaction anchors, and the envelope gives it nothing to compare.

The pass line names the block and says the binding is inclusion, not finality. A block can be reorganized inside the system's finality window and take the transaction with it. Treating the receipt as settled means applying that system's own finality depth. The verifier confirms inclusion at the moment of the check.

![Two columns. Offline shows a transaction hash labeled Pointer with status unknown. Online, EVM shows that hash bound to a Subject SHA-256 with status pass and the line Inclusion, not finality. Caption: Read the transaction before it passes.](/blog/images/settlement-offline-online.jpg)

For every other family, online confirmation is not built into the reference verifier. The check stays **unknown**, and the detail points at the explorer URL. The adapter withholds a pass it cannot bind: without decoding the transaction, there is no link to this evidence. Autonomys and Solana receipts are in this group today. The transaction can still be opened and read. The verifier's result for that reading stays unknown.

A system the registry does not know stays unknown online as well. There is no endpoint to call. An online check trusts the endpoint it does call. A compromised endpoint can invent a confirmation or a denial. Callers of the library can pass their own endpoints and query a node they run. The offline check contacts no endpoint.

## The same payload on every system

The transaction carries the same versioned JSON on every family. A file anchor looks like this.

```json
{
  "p": "fileonchain",
  "v": 1,
  "op": "anchor",
  "cid": "bafyrei…",
  "sha256": "9b2e71…c4aa"
}
```

`uri` is optional. `pid` is optional integrator attribution: which app produced the anchor. It confers no fee. The family clients differ in how that string gets into a transaction — a Substrate remark, an EVM registry call, an SPL Memo. The payload bytes are what an indexer parses.

A payload with `op` set to `manifest` is a different document. The EVM online check parses file and chunk anchors. It does not decode a manifest payload, so a manifest anchor is outside what that check confirms.

## Several receipts, each on its own

An envelope may carry settlement receipts from several systems. Each one says that system accepted a payload naming the digest. Each one stands if another system is unavailable. These are multi-system settlement receipts: independent attestations. The protocol has no step in which one system checks another's consensus. A receipt from one system is an attestation about that system alone.

![A SHA-256 digest with separate arrows to two settlement receipts, eip155:11155111 and solana:mainnet, and no link between the receipts. Caption: Each receipt stands alone.](/blog/images/settlement-independent.jpg)

A second receipt is another member of the array. Solana, under the non-EVM adapter, looks like this.

```json
{
  "type": "settlement",
  "adapter": "fileonchain-anchor/v1",
  "system": "solana:mainnet",
  "payload": {
    "chainId": "solana:mainnet",
    "txHash": "5vK…"
  }
}
```

A storage receipt can name a different system from the settlement receipt. Chunk bytes can live on one system and the settlement transaction on another, joined by a `fileonchain://` URI, as the [storage post](/blog/the-bytes-can-stay-where-they-are) describes. They can also be the same network. The verifier reports the two kinds of receipt in separate groups.

Which systems are integrated is a deployment fact. The [integrations](/integrations) page lists every network at its current status.

- Autonomys mainnet (`substrate:autonomys-mainnet`) and Autonomys Taurus (`substrate:autonomys-taurus`) are webapp-integrated. Both settle through native remarks, and both embed chunk data, so each can act as a storage system and a settlement system.
- Solana mainnet (`solana:mainnet`) and Solana devnet (`solana:devnet`) are webapp-integrated. Settlement uses the native SPL Memo program.
- Ethereum Sepolia (`evm:11155111`) and Auto EVM Chronos (`evm:8700`) are testnet-deployed. Each runs an anchor-only FileRegistry. The online binding check above is written for that call.

A receipt can name a system the verifier has never heard of. That check stays unknown, and the rest of the envelope still runs.

## A root counts when a settlement check binds it

An inclusion receipt is a membership proof under a Merkle root. The built-in adapter `fileonchain-merkle/v1` recomputes the path locally. A path that reaches the root shows membership in a tree. Anyone can build a tree around a leaf, so membership in the receipt's own root still needs a settlement check before it says a system accepted that root.

The verifier looks at the online settlement checks on the same envelope. When one of them passed and its bound values include that root, the inclusion detail notes that a confirmed settlement receipt anchored the root, and the inclusion check stays a pass. Otherwise the inclusion check becomes **unknown**. The detail says the proof is self-consistent. It then says either that no settlement receipt in the envelope anchors the root, or that a settlement payload contains the root and the on-chain binding was not verified. Offline mode adds that the online check was not requested.

The confirmation path that can keep the inclusion check a pass is the EVM online check above. A receipt on a family whose online check is not built leaves the inclusion result unknown, including when `--online` is set.

## The digest covers the receipt

Finalizing the envelope hashes the canonical document with the `envelope` member removed. Settlement receipts sit inside that region. Adding, removing, reordering, or editing one changes the envelope digest, and an envelope signature over the previous digest no longer verifies. That signature answers who assembled the complete envelope, receipts included. The artifact signature answers who signed the subject and the claims. Its payload stops at the subject, the claims, and the context they are bound to. The [first post](/blog/what-an-evidence-envelope-proves) keeps those two lines apart.

## Building one

`settlementReceiptFromAnchor` wraps a transaction that has already landed. It does the wrapping only. `createEvidence` hashes the subject bytes into the subject descriptor, collects artifact signatures, and finalizes, so the receipt is inside the digested region. The bytes are not copied into the envelope.

```ts
import { createEvidence, settlementReceiptFromAnchor } from "@fileonchain/sdk/evidence";

// subjectBytes and signer belong to the producer.
// signer is an EvidenceSigner: { signer, sign(payload) }.
// txHash is the settlement transaction that already landed.
const envelope = await createEvidence({
  subjectBytes,
  subjectMeta: { name: "archive.tar", mediaType: "application/x-tar" },
  signers: [signer],
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
```

FileOnChain Cloud's anchoring API takes a CID, a file name, a size, and a chunk count. The subject bytes are not part of that request. Account ids, credits, and retention rules stay in the hosted service. They are not members of a portable envelope.

## Check one on your own machine

[/verify](/verify) takes the envelope and asks for no account and no wallet. Leave the online checkbox off and a well-formed settlement receipt is reported unknown: structure only. Turn it on when you want the EVM binding check, or the explorer pointer for a family whose online check is not built.

```sh
fileonchain verify archive.evidence.json --json
fileonchain verify archive.evidence.json --artifact archive.tar --online --json
```

`--artifact` recomputes the subject digest from the file in front of you. It leaves the settlement transaction unread. `--online` asks the adapters that define an online check to confirm their receipts.

![A laptop receipt headed valid-with-warnings. The lines read Subject digest — pass, Settlement — unknown, and On-chain binding not verified offline, beside a file card labeled archive.evidence.json. Caption: Checked on this machine.](/blog/images/settlement-local-check.jpg)

Locally verified evidence means the document's digests, keys, and receipts were checked. A settlement receipt records a transaction a system was claimed to have accepted. The claim inside the envelope remains the signer's assertion. A signature establishes a key.
