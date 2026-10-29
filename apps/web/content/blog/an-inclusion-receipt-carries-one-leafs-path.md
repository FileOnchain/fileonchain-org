---
title: An inclusion receipt carries one leaf's path
description: The current inclusion tree prefixes each node and promotes a lone leaf. Proofs from the older tree stay on the legacy adapter.
date: 2026-10-29
author: Marc-Aurèle Besner
tags: protocol, verifier
---

A batch of subjects can share one settlement transaction. The producer builds a Merkle root over their SHA-256 digests, settles that root once, and gives each subject an inclusion receipt: the path from that one leaf to the root.

[What an evidence envelope proves](/blog/what-an-evidence-envelope-proves) names inclusion as the third receipt array, beside storage and settlement. [A settlement receipt names a transaction](/blog/a-settlement-receipt-names-a-transaction) states when a self-consistent path is allowed to stay a pass. This post is about the path itself. The current tree and the older tree produce different roots, and the adapter id tells the verifier which one a receipt used.

![Three digests in a row. A light-blue path runs from the first digest through one sibling to a Merkle root. The other two digests have no highlighted path. Caption: The receipt carries one leaf's path.](/blog/images/inclusion-one-path.jpg)

## One path, on one envelope

The [Evidence Protocol](/protocol) describes the batch this way.

1. Write a manifest that lists the subjects, in order. The envelope for that listing uses subject type `manifest`.
2. Build a Merkle tree over the subjects' SHA-256 digests, in that same order.
3. Settle the root once, on each settlement system you choose. The transaction names the root.
4. Put an inclusion receipt on each subject's envelope. The receipt carries that subject's path.

The verifier you hand a single envelope checks that envelope. It does not open the manifest, and it does not open the neighboring subjects. Membership for this subject is the path in this receipt, recomputed against the root written in this receipt.

Storage is a separate array. [The bytes can stay where they are](/blog/the-bytes-can-stay-where-they-are). An inclusion receipt does not say where the bytes live.

## Prefixes, then promotion

The current tree is normative. The reference implementation is `buildMerkleTree` in `@fileonchain/protocol`, re-exported from the reference SDK at `@fileonchain/sdk/protocol`.

Leaves are lowercase-hex SHA-256 digests, in manifest order. A leaf node is the SHA-256 of a `0x00` byte followed by the raw 32-byte digest. An internal node is the SHA-256 of a `0x01` byte followed by the left child and the right child, each as raw 32-byte hashes. A node that would sit alone at the end of a level is promoted unchanged to the next level.

The prefix keeps an internal node from being replayed later as a leaf. Promotion keeps two different sets of leaves from sharing a root: the root over the digests `[a, b, c]` differs from the root over `[a, b, c, c]`. The older habit, pairing a trailing node with a copy of itself, allowed that collision. Because a promoted node skips a level, a sibling list is not enough to recompute the path. The receipt also carries `leafCount`, the number of leaves in the whole tree. The check follows the inclusion-proof algorithm in RFC 9162.

![A three-leaf tree. Leaf A and leaf B, each tagged 0x00, sit under a parent tagged 0x01. Leaf C, tagged 0x00 and marked Promoted, sits beside that parent under the root. Caption: A lone node is promoted unchanged.](/blog/images/inclusion-prefixes.jpg)

The adapter id is `fileonchain-merkle/v1`. This is the receipt.

```json
{
  "type": "inclusion",
  "adapter": "fileonchain-merkle/v1",
  "payload": {
    "root": "…64 hex…",
    "leafIndex": 0,
    "leafCount": 3,
    "proof": ["…64 hex…", "…64 hex…"]
  }
}
```

When `leafDigest` is absent, the leaf is the envelope subject's `sha256`. A producer may also set `manifestDigest` to the SHA-256 of the canonical manifest. The offline check recomputes the path from `root`, `leafIndex`, `leafCount`, `proof`, and the leaf digest. It does not recompute `manifestDigest`, and it does not fetch the manifest.

The same tree, for three digests already in hand:

```ts
import { buildMerkleTree } from "@fileonchain/sdk/protocol";

// Lowercase-hex SHA-256 digests, in manifest order.
const tree = buildMerkleTree([digestA, digestB, digestC]);

const payload = {
  root: tree.root,
  leafIndex: 0,
  leafCount: tree.leafCount,
  proof: tree.proofFor(0),
};
```

The check is pure. It reads the envelope and returns. For a tree of three leaves, the proof for index 0 has two siblings: the leaf node beside it, and the promoted third leaf on the level above.

## What the path is allowed to mean

A path that recomputes shows that this leaf sits under this root, at this index, in a tree of this size. The root is chosen by whoever built the tree. Someone who controls construction can place any digest under any root they publish, and the path will still recompute. The verifier uses the root on the receipt. A root offered from somewhere else is a different input.

The path is silent about the other leaves. A valid path for leaf 0 says nothing about leaf 1, and nothing about whether a manifest lists what the producer says it lists. It says nothing about the truth, legal validity, or factual accuracy of the subject. A signed claim on the envelope remains an assertion by the signer.

> A path that reaches the root on the receipt is membership in that tree.

[A settlement receipt names a transaction](/blog/a-settlement-receipt-names-a-transaction) already states when the verifier lets that membership stay a pass. The short form belongs here because the tree is only half of the line. The inclusion check stays a pass only when an online settlement check on the same envelope has passed, and the values that check read from the transaction include this root. In the reference verifier, that online pass is the EVM adapter, `fileonchain-evm-anchor/v1`. The values it reads are the `cid` and `sha256` of a file anchor, the payload whose `op` is `anchor`, or the `cid` and `fileCid` of a chunk anchor. A payload whose `op` is `manifest` parses as neither, so that transaction does not supply them.

A pass confirms inclusion of the anchor transaction. Finality stays with the settlement system. Every other consistent proof is reported **unknown**. That includes an offline check, and it includes a family whose online check cannot yet decode the transaction. A path that does not recompute **fails**, and the report is **invalid**. A payload missing `root`, `leafIndex`, `leafCount`, or `proof`, or a subject with no `sha256` and no `leafDigest`, fails the same way.

![Two white cards. The left is labeled Membership and shows a path reaching a root. The right is labeled Settlement and shows a transaction naming that same root. Caption: The path and the transaction answer different questions.](/blog/images/inclusion-two-questions.jpg)

## The older tree keeps its adapter

The pre-separation tree still ships, under the same function name, from `@fileonchain/utils` and from the root entry of `@fileonchain/sdk`. `buildMerkleTree` there treats each digest as the leaf itself. A parent is the SHA-256 of the left child concatenated with the right child, with no `0x00` or `0x01`. A trailing node is paired with a copy of itself. The migrated receipt does not carry `leafCount`. `buildManifest` in that same module emits this tree, and it emits an anchor payload with `op` set to `manifest`.

That construction is the one `legacy-evidence-v1` used. `fileonchain migrate` preserves those proofs and tags the receipt `fileonchain-merkle-legacy/v1`. The legacy adapter checks them under the older rules, then applies the same settlement rule as the current adapter: a path that recomputes is still unknown until a settlement check binds the root.

![Two columns. The current column shows a leaf tagged 0x00, a parent tagged 0x01, and a lone node marked Promoted. The older column shows raw digests, an unprefixed parent, and a trailing node paired with a copy of itself. Caption: Two constructions, two roots.](/blog/images/inclusion-two-trees.jpg)

A proof from the older tree, presented with the adapter id `fileonchain-merkle/v1`, is the wrong tree. The current adapter requires `leafCount`, and it hashes with the prefixes. Leave the adapter id the migration wrote. New receipts use `buildMerkleTree` from `@fileonchain/sdk/protocol` and the adapter id `fileonchain-merkle/v1`.

![Two receipt cards. The current card reads merkle/v1 and lists leafCount. The legacy card reads merkle-legacy/v1 and lists a self-paired tree. Caption: The adapter id selects the tree.](/blog/images/inclusion-adapter-ids.jpg)

## Read the path you were given

Bring the envelope to [/verify](/verify), or run the CLI:

```sh
fileonchain verify envelope.evidence.json --json
```

The math runs offline. `--online` asks adapters to read public endpoints, which is what lets an EVM settlement check bind a root and leave the inclusion line a pass. `--artifact` is still the separate question of whether the bytes in front of you hash to `subject.digests.sha256`.

Locally verified evidence, on this line, means the path matched the root in the receipt and, only when the report says so, that a settlement check bound that same root. The other leaves stay unseen. The claims stay the signer's assertions.
