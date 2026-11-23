---
title: A subject type does not change the hash
description: Six subject types are labels. The verifier recomputes SHA-256 of the bytes you hand it, and checks size only when those bytes are present.
date: 2026-11-23
author: Marc-Aurèle Besner
tags: protocol, verifier
---

The subject answers one question: what is this evidence about? The answer is a descriptor. Its `type` is one of six labels. The value a verifier can recompute is `subject.digests.sha256`, and only from bytes you supply.

[What an evidence envelope proves](/blog/what-an-evidence-envelope-proves) names the four questions an envelope answers. [The bytes can stay where they are](/blog/the-bytes-can-stay-where-they-are) is about where a copy of those bytes lives. [A digest sees canonical JSON](/blog/a-digest-sees-canonical-json) is the encoding of the document around the digest. This post is the descriptor itself, and the check that compares it with bytes.

![Six cards labeled artifact, manifest, collection, event, resource, and abstract. Caption: Six labels, one descriptor.](/blog/images/subject-six-types.jpg)

## What the schema accepts

`type` is required. `validateEnvelope` accepts exactly `artifact`, `manifest`, `collection`, `event`, `resource`, and `abstract`. Any other string fails the schema check. The detail is:

```
subject.type must be one of artifact|manifest|collection|event|resource|abstract
```

A schema failure ends the report. The reference verifier returns **invalid** and does not emit a `subject-sha256` line.

The subject must carry at least one digest or a `uri`. With neither, the error is `subject needs at least one digest or a uri`. When `digests.sha256` is present it must be 64 lowercase hexadecimal characters. Uppercase hex, a `0x` prefix, or any other length fails with `subject.digests.sha256 is not 64 lowercase hex chars`. Other algorithm names may sit beside `sha256`. The schema check does not validate their spelling. Support for those algorithms is optional. Every conforming implementation has to support `sha256`.

`uri`, `cid`, `mediaType`, `size`, and `name` are optional. The schema check uses `uri` only as that alternative identifier. It does not fetch the URI, parse `cid`, or compare `name`, `mediaType`, or `size` with a file.

```json
{
  "type": "artifact",
  "digests": { "sha256": "…" },
  "mediaType": "application/pdf",
  "size": 48213,
  "name": "settlement-agreement-v3.pdf"
}
```

## One hash, six labels

The six types say what the producer intends the bytes to be.

- **artifact.** Concrete bytes: a document, a release archive, a dataset file, an agent's output.
- **manifest.** A document that lists other subjects. An inclusion receipt, when one is attached, is a separate check. [An inclusion receipt carries one leaf's path](/blog/an-inclusion-receipt-carries-one-leafs-path) is that check.
- **collection.** A grouping of subjects without a manifest document.
- **event.** An occurrence — an approval, a tool call, a deployment — whose record the producer hashed. The type does not define that record's layout.
- **resource.** An external thing identified by a URI.
- **abstract.** Anything else identified by a digest or a URI.

The type does not select a hash. `verifyEnvelope` calls `sha256Hex` on the `Uint8Array` you pass, for every type. That is the SHA-256 of those bytes. It is separate from canonical JSON of the envelope, and separate from canonical JSON of the descriptor. The producer decides which byte string the digest names. For an artifact, that string is the file. For an event, it is the record the producer chose to hash. Hand the verifier a different string and the comparison uses that string.

![A card labeled Bytes you supply, an arrow marked SHA-256, and a card labeled subject.digests.sha256. Below, a row labeled In the descriptor holds name, mediaType, cid, and uri. Caption: The hash is of the bytes.](/blog/images/subject-hash-of-bytes.jpg)

## What the subject line says

Step 2 of the verification algorithm is subject integrity. The reference implementation is `verifyEnvelope` in `@fileonchain/verify`.

**Bytes were supplied, and `sha256` is present.** The recomputed digest is compared with `subject.digests.sha256`. A match is `subject-sha256` **pass**, with the detail `sha256 <digest> matches`. A mismatch is **fail**, with `bytes hash to <digest>, envelope says <expected>`. Any failed check makes the report **invalid**. The checks after the subject still run.

**Bytes were supplied, and `sha256` is absent.** The line is a **warning**: `bytes provided but the subject carries no sha256 digest to compare`. A digest under another algorithm name, or a URI beside it, is not recomputed.

**No bytes were supplied.** If `sha256` is present, the line is **skipped**: `no subject bytes provided — integrity not checked`. A `uri` beside that digest does not change the line. If `sha256` is absent, the line is `subject-identity`, a **warning**: `subject identified by <uri> — nothing to hash-check locally`, or `subject identified by non-sha256 digests — nothing to hash-check locally` when no URI is set. The verifier does not fetch the URI.

`skipped` does not, by itself, change the overall status. The rollup looks at failures, drafts, warnings, and unknowns. Read the `subject-sha256` line. **Pass** means the bytes hashed to the digest in the envelope. **Skipped** means that comparison did not run.

`size` is compared only when bytes were supplied and the field is present. The comparison does not wait on the digest line. A length that differs fails `subject-size`, with the detail `bytes are <n> long, envelope says <size>`. A length that matches adds no line. With no bytes supplied, `size` stays the number the producer wrote.

The warning row in the figure is the case where bytes were supplied and `sha256` is absent. The URI-only case is a different line, `subject-identity`, and it is also a warning.

![A card titled subject with four rows: pass, bytes match; fail, bytes differ; skipped, no bytes supplied; warning, no sha256 to recompute. Caption: Read the subject line.](/blog/images/subject-check-lines.jpg)

## The name rides in the signature

`name`, `mediaType`, `cid`, `uri`, `size`, and `type` are members of the subject object. They are inputs to the artifact signing payload, and they are left out of `sha256Hex`. [A signature cannot change its context](/blog/a-signature-cannot-change-its-context) shows that payload: the whole subject is one of its members. Editing the name after signing changes the canonical string, so `payloadDigest` fails before the signature scheme runs. `subject-sha256` can still pass, because the bytes did not change.

With a subject and no profile, claims, or scope, that string is:

```json
{"protocol":"fileonchain-evidence","purpose":"artifact","subject":{"digests":{"sha256":"…"},"mediaType":"application/pdf","name":"settlement-agreement-v3.pdf","size":48213,"type":"artifact"},"version":1}
```

An unsigned envelope has no such binding. The name, the media type, and the CID are labels the producer wrote. The subject checks do not compare them with the file.

![Two cards. subject-sha256 shows pass and bytes match. payloadDigest shows fail and name changed. Caption: The name is inside the signature.](/blog/images/subject-name-and-signature.jpg)

## Hand the verifier the bytes

[/verify](/verify) takes an envelope and, beside it, an optional file labeled "Subject bytes (optional)". The note under that control says the file is the original artifact, used to recompute its digest locally. The bytes stay in the browser. Nothing on that page is uploaded to FileOnChain.

The same option is the CLI flag `--artifact`. Offline is the default. `--online` asks adapters to confirm receipts. It leaves the subject check as it is.

```sh
fileonchain verify envelope.evidence.json --artifact ./the-bytes --json
```

Leave `--artifact` off, and a subject that carries `sha256` reports `subject-sha256` as skipped. Pass the bytes, and that line is the comparison.

A local check of the digest shows that these bytes hash to the value in the envelope. The type says what the producer calls them. The signature, when one verifies, shows which key stood behind the descriptor. What the bytes mean remains the signer's assertion.
