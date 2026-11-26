---
title: A signed claim is still an assertion
description: Claim keys are reverse-DNS namespaces. Unknown ones are preserved and reported unknown. Extensions sit in the digest, outside the artifact signature.
date: 2026-11-26
author: Marc-Aurèle Besner
tags: protocol, verifier
---

A claim says what a signer asserts about the subject. A signature that verifies establishes that this key asserted it. The claim remains an assertion.

[What an evidence envelope proves](/blog/what-an-evidence-envelope-proves) names the four questions an envelope answers. Claims are the second: what is asserted about the subject. [A signature cannot change its context](/blog/a-signature-cannot-change-its-context) shows that those claims sit inside the artifact signing payload. This post is the namespace, the line the verifier writes for one it does not own, and the extension field beside the claims.

![A card labeled Signed claim, holding org.example.release and a green pill marked asserted, beside an empty card labeled Fact. Caption: The signature covers the assertion.](/blog/images/claims-assertion-not-a-fact.jpg)

## The key is a namespace

`claims` is one object. Each key is a reverse-DNS namespace: lowercase labels separated by dots, at least two labels. Digits and hyphens may appear inside a label. The schema check in `validateEnvelope` is this pattern:

```
^[a-z0-9-]+(\.[a-z0-9-]+)+$
```

`org.example.release` matches. `com.example.legal` matches. A single label does not. Uppercase letters do not. `notNamespaced` fails the schema check with this detail:

```
claims namespace "notNamespaced" is not reverse-DNS (e.g. org.example.thing)
```

The value under the key is the producer's. `validateEnvelope` tests the key and does not walk the value, so a string, a number, or a nested object under a well-formed key all pass that check. Meaning belongs to the profile that owns the namespace, when one does.

A key that fails the pattern is a schema failure. The reference verifier, `verifyEnvelope` in `@fileonchain/verify`, records `schema` as **fail** and returns. The report is **invalid**. No `claims:` line is emitted. A key that matches the pattern passes, whether or not any profile owns it. The [Evidence Protocol](/protocol) requires an implementation to preserve a namespace it does not understand.

```json
{
  "claims": {
    "org.example.release": {
      "version": "1.4.0",
      "commit": "a1b2c3d"
    }
  }
}
```

The protocol names no fields inside `org.example.release`. A release record, a matter id, and a dataset license are the same shape at this layer: a namespace, then the object the producer wrote.

![Two rows. org.example.release with a green accepted pill, and release with a red rejected pill. Caption: Two labels, at least.](/blog/images/claims-namespace-pattern.jpg)

## What the verifier reports

Step 3 is the profile and the claims. Both lines belong to the `claims` group.

**No profile is set.** Every key of `claims` becomes one line, named `claims:<namespace>`, with status **unknown**. The detail is the same for every namespace:

```
namespace preserved but not validated by any registered profile — signed claims are assertions, not facts
```

The namespace is in the check name. With `claims` absent, or with `claims` equal to `{}`, the loop emits nothing.

**A profile is set, and this verifier has registered it.** The profile's `validate` runs. An empty error list is the `profile` line at **pass**, with the detail `conforms to <profile id>`. Any error is **fail**, and the messages are joined with `; `. A failure makes the whole report **invalid**. The signature checks still run after it, so `signature[i]` can pass over claims the profile rejected. That pass establishes the key that asserted those claims. The `profile` line says the claims do not conform to the profile.

The reference verifier's package entry imports `@fileonchain/agent-profile`, which registers one profile: `org.fileonchain.agent/v1`, owning the namespace `org.fileonchain.agent`. [Seal an agent run without publishing the prompt](/blog/seal-an-agent-run-without-publishing-the-prompt) is what that namespace carries. An owned namespace does not get its own `claims:` line. Conformity is the `profile` line.

A second namespace on the same envelope is still unknown. The agent claims can conform while `claims:com.example.legal` is unknown. The verifier kept that object and did not interpret it.

**A profile is set, and this verifier has not registered it.** The `profile` line is **unknown**, and the detail names the id:

```
profile com.example.other/v1 is not registered with this verifier — its claims were not validated
```

No registered profile means no owned namespaces, so every claim key on that envelope is also unknown. When the envelope carries a `profile`, the summary copies it and sets `profileKnown` from whether `getProfile` found that id. The schema check does not parse the profile id. The specification writes one as `"<namespace>/v<major>"`. An unregistered string is reported unknown either way. With an unregistered profile and no `claims` object, the report has the `profile` line and no `claims:` line.

An unknown line does not, by itself, make the report invalid. Any **fail** does. A draft, which has no envelope digest, is **incomplete** when nothing has failed. Otherwise a warning or an unknown yields **valid-with-warnings**. The four statuses are in [What an evidence envelope proves](/blog/what-an-evidence-envelope-proves). When an artifact signature's payload matches, `signature[i]:key-status` is unknown, so a passing profile still comes back `valid-with-warnings`. That line is in [A signature cannot change its context](/blog/a-signature-cannot-change-its-context).

![A claims card with profile marked pass and claims:com.example.legal marked unknown. Caption: The other namespace stays unknown.](/blog/images/claims-unknown-line.jpg)

## The signature covers the claims that were signed

Claims that are present when the artifact signature is made are a member of its payload. With a subject, no profile, and no scope, the claim above produces this canonical string. Keys are sorted at every depth, so `commit` precedes `version`:

```json
{"claims":{"org.example.release":{"commit":"a1b2c3d","version":"1.4.0"}},"protocol":"fileonchain-evidence","purpose":"artifact","subject":{"digests":{"sha256":"…"},"type":"artifact"},"version":1}
```

Editing either field, adding a namespace, or removing one changes that string. `payloadDigest` then fails, and the scheme check does not run. The claim line and the signature line stay separate: a namespace the verifier does not own can sit under a signature that passes.

Every artifact signature on the envelope is checked against that same claims object. Purpose and scope still come from each signature, as the earlier post describes.

An empty claims object is omitted from the signing payload. `buildEnvelope` also omits an empty claims object from the envelope it assembles. A hand-written `"claims": {}` still passes the schema check, and it adds no `claims:` line.

## Extensions sit outside that signature

`extensions` carries non-claim data under the same kind of key: migration records, producer bookkeeping. The specification describes those keys as namespaces, like claims. `validateEnvelope` applies the reverse-DNS pattern to claim keys. It does not apply that pattern to extension keys, and it does not reject an extension it does not understand. The verifier emits no line for `extensions`.

The split that matters is which bytes include them.

- The artifact signing payload includes `claims` when that object has at least one key. It has no `extensions` member.
- The envelope digest is SHA-256 of the canonical envelope with the `envelope` member removed. `extensions` is inside that region. So is `claims`. [A digest sees canonical JSON](/blog/a-digest-sees-canonical-json) is that encoding.

Changing an extension after the artifact signature leaves `payloadDigest` matching. It changes the envelope digest. [A signed digest binds the receipts](/blog/a-signed-digest-binds-the-receipts) is the check over that region. Extensions are inside it, the same way receipts are. The digest is evidence of the assembled document when an envelope signature covers it.

`fileonchain migrate` uses the split on purpose. Legacy signatures signed a different payload, so the migrated envelope leaves the artifact `signatures` array empty and stores those signatures under `extensions["org.fileonchain.legacy"]`, beside a migration record. The stored signatures stay legacy signatures.

`id` and `createdAt` sit in that same digested region, and outside the artifact signing payload. Both are optional. `id` is a producer-assigned identifier, and the schema check does not constrain its shape. `createdAt` is a producer-asserted time. The schema check accepts an ISO 8601 timestamp that carries a time and a zone, and rejects any other string with `createdAt must be an ISO 8601 timestamp`. The summary copies the string onto the report as claimed. Editing either field changes the envelope digest.

![Two cards. The artifact payload lists claims and omits extensions. The envelope digest lists claims and extensions. Caption: Extensions sit outside the artifact signature.](/blog/images/claims-extension-outside.jpg)

## Check one on your own machine

[/verify](/verify) takes the envelope and asks for no account and no wallet. The same verifier is the CLI. Offline is the default.

```sh
fileonchain verify envelope.evidence.json --json
```

On a namespace this verifier does not own, find `claims:<namespace>`. The status is `unknown`, and the detail is the sentence in the section above. On `org.fileonchain.agent/v1`, find `profile`. A pass reads `conforms to org.fileonchain.agent/v1`. A missing `org.fileonchain.agent` object fails with:

```
profile org.fileonchain.agent/v1 requires claims["org.fileonchain.agent"]
```

Field problems on that object are prefixed with `org.fileonchain.agent:` and joined with `; `. A namespace this verifier owns does not appear as its own `claims:` line. A namespace beside it does. When the payload still matches, `signature[0]` is a separate line. It establishes the key that asserted the claims.
