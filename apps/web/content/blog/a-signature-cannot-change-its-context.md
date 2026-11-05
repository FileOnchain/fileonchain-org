---
title: A signature cannot change its context
description: The artifact signing payload binds protocol, version, purpose, profile, subject, claims, and scope. A mismatch fails before any cryptography.
date: 2026-11-05
author: Marc-Aurèle Besner
tags: protocol, verifier
---

An artifact signature is a signature over one canonical string. That string is the artifact signing payload. It names the protocol, the version, the purpose, the profile when the envelope has one, the subject, the claims when there are any, and the scope when the signature carries one. Change any of those and the string changes. The `payloadDigest` on the signature no longer matches, and the reference verifier fails the signature before it runs the cryptography.

[What an evidence envelope proves](/blog/what-an-evidence-envelope-proves) separates an artifact signature from an envelope signature, and says what a local check is allowed to mean. [A digest sees canonical JSON](/blog/a-digest-sees-canonical-json) is the encoding of the string. [A signed digest binds the receipts](/blog/a-signed-digest-binds-the-receipts) is the later signature, the one over the assembled envelope. This post is the context inside the artifact signature, and the order of the checks.

![A card titled Artifact signing payload listing protocol, version, purpose, profile, subject, claims, and scope, with receipts, extensions, and signedAt sitting outside the card. Caption: The signature covers this context.](/blog/images/context-signing-payload.jpg)

## The bytes that get signed

The reference function is `artifactSigningPayload` in `@fileonchain/protocol`. It returns canonical JSON: object keys sorted by UTF-16 code unit, no insignificant whitespace, UTF-8. `payloadDigest` is the SHA-256 of that string, as 64 lowercase hex characters. The signer signs the string. The verifier rebuilds the string from the envelope in front of it.

For a subject that is only a type and a URI, with the purpose left at its default, the string is:

```json
{"protocol":"fileonchain-evidence","purpose":"artifact","subject":{"type":"resource","uri":"https://example.com/report.md"},"version":1}
```

`purpose` is in the string even when the signature object omits the field. The default is `"artifact"`. Writing `"artifact"` explicitly produces the same string.

The other members follow the same omission rule as the rest of the canonical encoding. An absent member is left out. It is not written as `null`.

- **Profile.** Included only when the envelope sets one. `"profile":"org.fileonchain.agent/v1"` sorts ahead of `"protocol"`.
- **Claims.** Included only when the claims object is non-empty. `{}` is omitted. Claims that are present are canonicalized at every depth, so a claim written as `b` then `a` is signed as `{"a":2,"b":1}`.
- **Scope.** Included when the signature carries a scope object. Inside it, `organization` sorts before `project`. Omitting scope and passing `{}` produce different strings: the builder includes any scope object it is given, and the empty object is present in the canonical JSON.
- **Subject.** The whole descriptor. A display name, a media type, a size, a CID, and a URI sit in the signed string beside the digest. Keys inside the subject are sorted too, so `name` precedes `type`, and `type` precedes `uri`.
- **Protocol and version.** `fileonchain-evidence` and `1`. Both are inside every artifact signing payload.

Receipts, extensions, `createdAt`, the envelope `id`, and `signedAt` sit outside this string. `signedAt` is an asserted time written beside the signature. Editing it leaves `payloadDigest` and the signature bytes as they were. A settlement receipt is a different kind of time: a record that a settlement system accepted a payload naming a digest. [A settlement receipt names a transaction](/blog/a-settlement-receipt-names-a-transaction) is that record.

The envelope signing payload is a separate string. Its purpose is `"envelope"`, and its body is the envelope digest. The two signatures are stored in different arrays and cover different bytes. Adding a receipt changes the envelope digest. It leaves an artifact signature's payload as it was, which is why receipt binding is the envelope signature's job.

## The check runs before the cryptography

For each artifact signature, `@fileonchain/verify` rebuilds the payload from the envelope's subject, claims, and profile, and from that signature's purpose and scope. It hashes the string and compares the hex with `payloadDigest`.

A mismatch fails that signature. The detail is fixed:

> payloadDigest does not match the canonical signing payload (context binding failed — wrong subject, claims, profile, purpose, or scope)

The scheme check is skipped for that signature. The verifier moves on to the next one.

These two strings are the default purpose and `"approval"`, over the same subject. `artifactSigningPayload` emits them exactly:

```json
{"protocol":"fileonchain-evidence","purpose":"artifact","subject":{"type":"resource","uri":"https://example.com/report.md"},"version":1}
```

```json
{"protocol":"fileonchain-evidence","purpose":"approval","subject":{"type":"resource","uri":"https://example.com/report.md"},"version":1}
```

A signature made over the first, stored on an object whose `purpose` is `"approval"`, still carries the `payloadDigest` of the `"artifact"` string. The comparison fails. ed25519 and EIP-191 are not asked about those bytes.

A producer who rewrites `payloadDigest` to the new string, and keeps the old signature bytes, gets past the comparison. The scheme check then fails. Those bytes are a signature over the previous string.

![Two canonical payload lines that differ only in purpose, artifact and approval, with a fail mark on payloadDigest. Caption: The mismatch fails before the cryptography.](/blog/images/context-purpose-fails-first.jpg)

When the digest matches, the verifier checks the scheme over that same canonical string.

- **eip191.** The payload is the message. `signer.publicKey` is the EVM address the signature must recover to. The signature hex may carry a `0x` prefix; the verifier checks the prefixed form and the bare form as the same signature.
- **ed25519.** The public key is 64 lowercase hex characters (32 bytes), with no `0x` prefix. The signature is 128 lowercase hex characters (64 bytes), with no `0x` prefix. Uppercase hex fails the check. Verification is strict RFC 8032, with `zip215: false`: a non-canonical encoding that a lenient verifier would accept is rejected, so one signature record has one byte form.
- **Any other scheme.** The schema accepts `eip191` or `ed25519`. A different scheme fails validation, and the report is invalid.

When the purpose field is present and is something other than `"artifact"`, the scheme line gains a suffix: ` · purpose "approval"`. The default purpose adds nothing to that line.

## What moving it changes

Each of these is a different payload. A signature from one of them fails `payloadDigest` when it is placed on another.

- **Purpose.** An artifact sign-off and an approval are different strings, so the purpose travels with the signature. [Seal an agent run without publishing the prompt](/blog/seal-an-agent-run-without-publishing-the-prompt) shows an approval claim pointing at its own signature with `signatureIndex`. The purpose on that signature is what the payload was built with.
- **Profile.** The profile is read from the envelope, once, for every artifact signature. Remove `org.fileonchain.agent/v1`, or replace it, and the rebuilt string differs from the one that was signed.
- **Subject.** Replacing the digest, the URI, the name, the media type, the size, or the CID replaces the subject member. The subject digest remains the hash of the artifact bytes. When the bytes are in hand, the verifier recomputes that hash as its own check. The signing payload hashes the descriptor that contains the digest, name included. Renaming the subject is a context change.
- **Claims.** Editing a claim edits the string. A signature over the previous claims fails. Locally verified evidence checks that binding. The claim itself stays an assertion by the signer.
- **Scope.** `scope` carries an optional `organization` and an optional `project`. A signer sets it so the signature holds for that organization or project. A signature made with `"organization":"acme"` and `"project":"releases"` fails when that object is dropped or rewritten. The canonical member is `"scope":{"organization":"acme","project":"releases"}`.

![A signature bound to organization acme and project releases, and the same signature presented under a different organization, with payloadDigest marked fail. Caption: Scope is part of the signed bytes.](/blog/images/context-scope-does-not-travel.jpg)

Two artifact signatures on one envelope are checked against that envelope's subject, claims, and profile. Purpose and scope are read from each signature, so an author and an approver can both sign, with different purposes, and each check stands on its own. The two payloads share the subject and the claims. They differ where the signature itself carries a purpose or a scope.

Contradictory claims are two envelopes. The protocol has no uniqueness rule for a subject, and a verifier has no second document to consult. Each report says who signed the envelope it was handed. Which signer set to rely on, and which settlement time to prefer, is a decision for the relying party, using the keys they trust and the receipts on each envelope.

## What the key establishes

A matching `payloadDigest` and a valid scheme check establish that this key signed this context. Three further lines say how far that reaches. They are reported for artifact signatures.

- **Identity.** When `signer.id` is set, `signature[i]:identity` is unknown. The detail is: `claims identity "<id>" (<kind>) — the signature proves the key, not the identity binding`. The kind is one of `wallet`, `organization`, `agent`, `human`, or `service`. With no `id`, that line is absent. The public key is the material the scheme verified.
- **Delegation.** `onBehalfOf` records that the key acts for another identity, `{ kind, id, authorization? }`. With no `authorization`, `signature[i]:delegation` is a warning: `claims to act for <id> with no verifiable delegation statement`. With an `authorization` string, the line is unknown: `carries a delegation statement for <id> — validate it out of band`. The string is preserved. Checking it is left to the relying party.
- **Key status.** `signature[i]:key-status` is unknown on every artifact signature. A `keyStatusUrl`, when set, changes the detail to `check rotation/revocation at <url>`. With no URL, the detail is `no key-status endpoint declared — revocation cannot be checked from the envelope alone`. Fetching the URL is left to the relying party. A signature that verifies is a signature by that key. Revocation stays unknown from the envelope alone. A settlement receipt supplies a time the settlement system can speak for, which a relying party can set beside a compromise window.

![Three verifier lines: signature pass, identity unknown, and key status unknown, beside a public key. Caption: The signature proves the key.](/blog/images/context-key-not-the-name.jpg)

Those unknown lines are why a signed envelope ordinarily comes back `valid-with-warnings`. Unknown is a result. A failure anywhere, including a `payloadDigest` mismatch, makes the report `invalid`. The four statuses, and the reason artifact signatures and envelope signatures stay on separate lines, are in [the earlier post](/blog/what-an-evidence-envelope-proves).

## Check one on your own machine

[/verify](/verify) takes the envelope and asks for no account and no wallet. The same verifier is the CLI:

```sh
fileonchain verify envelope.evidence.json --json
```

On a signature whose context still matches, `signature[0]` is the scheme check, and its detail names EIP-191 or ed25519 and the public key. On a signature whose purpose, profile, subject, claims, or scope has changed underneath it, that same line is a failure, and the detail is the payload mismatch above. The scheme result is absent.

`signature[0]:identity`, `signature[0]:delegation`, and `signature[0]:key-status` are the three lines from this post. Identity appears when the signer carries an id. Delegation appears when the signer carries `onBehalfOf`. Key status appears on every artifact signature.

The string under `payloadDigest` is the context. The purpose, the profile, the subject, the claims, and the scope stay with the signature that was made over them.
