# FileOnChain Evidence Protocol Specification

**Protocol identifier:** `fileonchain-evidence` · **Version:** 1
**Status:** Normative
**Reference implementation:** [`packages/protocol`](../../packages/protocol) (`@fileonchain/protocol`)
**Reference verifier:** [`packages/verify`](../../packages/verify) (`@fileonchain/verify`)

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL
NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and
**OPTIONAL** in this document are to be interpreted as described in
RFC 2119.

Paragraphs marked *Note (non-normative)* are informative only.

---

## 1. Scope

This specification defines the **evidence envelope**: a portable,
self-contained JSON document that binds a *subject* — any digital thing
identified by digest or URI — to claims about it, cryptographic
signatures over it, and receipts from external storage, settlement, and
inclusion systems, such that an independent party can verify the whole
document deterministically and locally.

The protocol is deliberately neutral. It **MUST NOT** be read as
assuming that the subject is a file, an AI-agent run, a blockchain
transaction, a legal document, or a software release. A subject may be
any of these, or a research dataset, an approval event, or an abstract
resource known only by its digest. Application-specific semantics live
in **profiles** (§7.3); system-specific receipt formats live in
**adapters** (§9–§11).

Out of scope for this document: billing and pricing of any hosted
service, the rollout status of any particular storage or settlement
system, product positioning, and the internal behavior of any specific
adapter beyond the built-in ones defined here. Hosted-product concerns
are documented separately (see `docs/product/fileonchain-cloud.md`);
per-network integration statuses live in `docs/integrations/status.md`.

An envelope proves existence, integrity, signing keys, and — through
receipts — timing. It does not prove that its subject is true, legally
valid, or factually accurate, and a signature proves the key, never the
person or organization behind it.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| **Evidence envelope** | The protocol document defined by this specification. "Evidence package" is acceptable user-facing language for the same thing; "evidence envelope" is the precise protocol term. |
| **Subject** | The thing the envelope is about, identified by a subject descriptor (§5). |
| **Artifact** | A subject that is concrete bytes. |
| **Claim** | A namespaced assertion about the subject, made by the producer and possibly covered by artifact signatures (§7). |
| **Profile** | A named, versioned set of claim semantics and validation rules for one application domain (§7.3). |
| **Artifact signature** | A signature answering: *who signed the subject and its claims?* (§8.2) |
| **Envelope signature** | A signature answering: *who assembled this complete envelope, receipts included?* (§8.3) |
| **Receipt** | A tagged record from an external system — storage, settlement, or inclusion — whose format and checks are owned by an adapter (§9–§11). |
| **Storage system** | An external system holding a copy of the subject bytes. |
| **Settlement system** | A public system (typically a blockchain) whose transactions fix a digest at a time. |
| **Adapter** | The named, versioned owner of one receipt format: its payload schema, offline checks, online checks, finality behavior, and error states (§9). |
| **Envelope digest** | The deterministic digest over the envelope's digested region (§12). |
| **Draft** | An envelope without an `envelope` finalization block. |
| **Finalized envelope** | An envelope carrying its envelope digest. |
| **Locally verified evidence** | An envelope whose checks a verifier ran deterministically without trusting any producer service. Never phrased as a "verified claim": verification proves keys, digests, and receipts — not the truth of claims. |

## 3. Design principles

1. **Neutral core.** The envelope schema carries no application
   vocabulary and no system-specific fields. Domain semantics are
   profile claims; system specifics are adapter payloads.
2. **Deterministic local verification.** Everything a verifier needs is
   in the envelope (plus, optionally, the subject bytes and public
   endpoints of receipt systems). No producer service is ever in the
   verification loop.
3. **Unknown is not invalid.** A verifier encountering an unregistered
   profile or adapter **MUST** report it as *unknown* and preserve it —
   never treat it as a failure (§13, §14).
4. **Signatures are context-bound.** Every artifact signature binds the
   protocol identity, purpose, profile, subject, claims, and scope, so
   a signature made in one context cannot be replayed in another
   without detection (§8.2).
5. **Honest semantics.** A signed claim is an assertion by the signer,
   never proven true by the signature. Receipts prove time; `signedAt`
   and `createdAt` are asserted.
6. **Extensibility with preservation.** Implementations **MUST**
   preserve unknown claims and extensions byte-for-byte after
   canonicalization; round-tripping an envelope through a conforming
   implementation must not lose them.

## 4. Evidence envelope

An evidence envelope is a JSON object with the following members:

| Member | Type | Presence | Meaning |
| --- | --- | --- | --- |
| `protocol` | string | REQUIRED | **MUST** be `"fileonchain-evidence"`. |
| `version` | number | REQUIRED | **MUST** be `1` for this specification. |
| `id` | string | OPTIONAL | Producer-assigned identifier, opaque to the protocol. |
| `profile` | string | OPTIONAL | Application profile in force, e.g. `"org.fileonchain.agent/v1"`. Bound into artifact signing payloads when present (§8.2). |
| `subject` | object | REQUIRED | Subject descriptor (§5). |
| `claims` | object | OPTIONAL | Namespaced claims (§7). |
| `signatures` | array | REQUIRED | Zero or more artifact signatures (§8.2). An unsigned envelope is valid: it proves integrity and time only, with no attribution. |
| `receipts` | object | REQUIRED | `{ storage: [], settlement: [], inclusion: [] }` — three arrays, each possibly empty (§9–§11). |
| `extensions` | object | OPTIONAL | Namespaced non-claim extension data (§7.2). |
| `createdAt` | string | OPTIONAL | Producer-asserted creation time, ISO 8601. |
| `envelope` | object | OPTIONAL | Finalization block: `{ digest: { sha256 }, signatures: [] }` (§12). Absent on drafts. |

The RECOMMENDED media type for exported envelopes is
`application/vnd.fileonchain.evidence+json`; the RECOMMENDED filename
suffix is `.evidence.json`.

The interchange form is ordinary human-readable JSON. Only digest and
signature computation normalize to the canonical form (§6).

*Note (non-normative).* The four member groups mirror the four
questions an envelope answers: *what is this?* (subject), *what is
asserted about it?* (claims, under a profile), *who stands behind it?*
(signatures), and *what did external systems record?* (receipts).

## 5. Subject descriptors

The subject descriptor identifies what the evidence is about:

```json
{
  "type": "artifact",
  "digests": { "sha256": "…64 lowercase hex…" },
  "uri": "…",
  "cid": "…CIDv1 base32…",
  "mediaType": "application/pdf",
  "size": 48213,
  "name": "settlement-agreement-v3.pdf"
}
```

### 5.1 Subject types

`type` is REQUIRED and **MUST** be one of exactly six values:

| Type | Meaning |
| --- | --- |
| `artifact` | Concrete bytes — a signed legal document, a release tarball, a dataset file, an agent's output report. |
| `manifest` | A document that lists other subjects, usually Merkle-batched (§11). |
| `collection` | A grouping of subjects without a manifest document. |
| `event` | An occurrence — an approval, a tool invocation, a deployment — whose canonical record was hashed. |
| `resource` | An external, URI-identified thing. |
| `abstract` | Anything else identified by digest or URI. |

### 5.2 Identification

A subject **MUST** carry at least one digest or a `uri`.

- `digests` is a set keyed by lowercase algorithm name. When present,
  `digests.sha256` **MUST** be 64 lowercase hexadecimal characters —
  the SHA-256 of the subject's canonical bytes. Other algorithms MAY
  appear alongside it. Every conforming implementation **MUST** support
  `sha256`; support for other algorithms is OPTIONAL.
- `uri` is a stable identifier for `resource`/`abstract` subjects, or a
  locator hint for others.
- `cid`, when present, is a CIDv1 (base32) content address.
- `mediaType`, `size`, and `name` are OPTIONAL metadata. When `size` is
  present and subject bytes are supplied to a verifier, the byte length
  **MUST** match (§13, step 2).

*Note (non-normative).* Multi-domain examples: a **legal document** is
`{ type: "artifact", digests: { sha256 }, mediaType: "application/pdf" }`;
a **software release** is an `artifact` (the tarball) or a `manifest`
(its file list); a **research dataset** too large to hash as one blob
is a `manifest` over its files; an **agent output** is an `artifact`
whose provenance rides in profile claims, not in the subject.

## 6. Canonical encoding

Every digest and signature in the protocol is computed over **canonical
JSON**: the UTF-8 bytes of a deterministic serialization. Conforming
implementations **MUST** produce byte-identical canonical output for
the same value. The rules:

1. Object keys **MUST** be sorted by Unicode code point at every depth.
2. Arrays **MUST** be serialized in place; element order is
   significant.
3. There **MUST** be no insignificant whitespace.
4. The result is encoded as UTF-8.
5. Object members whose value is `undefined` (absent) are omitted;
   an undefined element *inside an array* is an error, not a silent
   `null`.
6. Non-finite numbers, BigInt values, functions, and symbols are
   errors — they **MUST NOT** appear in an envelope.
7. Strings are **NOT** Unicode-normalized. Producers **MUST** emit the
   exact code points they intend to sign (see §16.1).
8. Numbers **SHOULD** be integers within the IEEE-754 safe range
   (|n| ≤ 2^53 − 1). Fractional values are serialized with the
   ECMAScript number-to-string algorithm, which conforming
   implementations **MUST** reproduce exactly; producers **SHOULD**
   prefer strings for any value where that is a burden.

The reference implementation is `canonicalStringify` in
[`packages/protocol/src/canonical.ts`](../../packages/protocol/src/canonical.ts).

*Note (non-normative).* Canonicalization operates on parsed values.
Because standard JSON parsers silently keep the last of duplicate keys,
post-parse canonicalization cannot detect duplicates in the wire form —
see §16.1 for the required mitigation.

## 7. Claims and extensions

### 7.1 Claims

`claims` is an object whose keys are **reverse-DNS namespaces** —
lowercase labels joined by dots, at least two labels, matching
`^[a-z0-9-]+(\.[a-z0-9-]+)+$` (e.g. `org.fileonchain.agent`,
`com.example.compliance`). Values are objects defined by the owning
profile or producer.

- Claims present at signing time are covered by artifact signatures
  (§8.2). A signed claim is an **assertion by the signer** — the
  signature proves who asserted it, never that it is true.
- Implementations **MUST** preserve claim namespaces they do not
  understand, byte-for-byte after canonicalization. Unknown namespaces
  are not errors.
- Verifiers **MUST** report claims in namespaces not validated by any
  registered profile as *unknown*, not as failures (§13, step 3).

*Note (non-normative).* A legal-tech producer might record
`"com.example.legal": { matterId, jurisdiction, executionDate }`; a
release pipeline might record
`"org.example.release": { version, commit, builder }`; a data steward
might record `"org.example.dataset": { license, collectionPeriod }`.
The protocol validates none of these — their profiles do.

### 7.2 Extensions

`extensions` carries namespaced non-claim data (migration records,
producer bookkeeping), keyed like claims. Extensions are inside the
digested region (§12) but are **not** part of the artifact signing
payload. Implementations **MUST** preserve unknown extensions.

### 7.3 Profiles

A profile is a named, versioned definition
(`"<namespace>/v<major>"`, e.g. `"org.fileonchain.agent/v1"`) that
owns one or more claim namespaces and a validation rule. When
`envelope.profile` is set:

- The profile id is bound into every artifact signing payload (§8.2).
- A verifier that has the profile registered **MUST** run its
  validation; one that does not **MUST** report the profile as
  *unknown* and leave its claims unvalidated but preserved.

The first official profile is the Agent Evidence Profile —
`docs/profiles/agent-evidence-v1.md`.

## 8. Signatures and delegations

### 8.1 Signer identity

Every signature carries a `signer`:

| Field | Presence | Meaning |
| --- | --- | --- |
| `kind` | REQUIRED | `"wallet"`, `"organization"`, `"agent"`, `"human"`, or `"service"`. |
| `publicKey` | REQUIRED | Key material the signature verifies against: an EVM address for `eip191`; a 32-byte lowercase-hex public key for `ed25519`. |
| `scheme` | REQUIRED | `"eip191"` or `"ed25519"` (conforming verifiers **MUST** support both; see §17). |
| `id` | OPTIONAL | Stable identifier — an address, a DID, a domain, an agent id. The verifier reports the identity binding as *unknown*: the signature proves the key, not the identity. |
| `onBehalfOf` | OPTIONAL | Delegation: `{ kind, id, authorization? }`. Without an independently verifiable `authorization` statement, verifiers **MUST** report the delegation as claimed, not proven. |
| `keyStatusUrl` | OPTIONAL | Where the key's rotation/revocation status can be checked. Verifiers **MUST** report key status as *unknown* when absent — a signature alone cannot prove the key was unrevoked at signing time. |

### 8.2 Artifact signatures

An **artifact signature** answers: *who signed or approved the subject
and its claims?* It is computed over the **artifact signing payload** —
the canonical JSON (§6) of:

```json
{
  "protocol": "fileonchain-evidence",
  "version": 1,
  "purpose": "<purpose, default \"artifact\">",
  "profile": "<envelope profile — present only when set>",
  "subject": { … },
  "claims": { … present only when non-empty … },
  "scope": { "organization": "…", "project": "…" }
}
```

(`profile`, `claims`, and `scope` members are omitted when absent, per
§6 rule 5.)

Each `ArtifactSignature` carries:

- `signer` (§8.1);
- `payloadDigest` — the SHA-256 (lowercase hex) of the canonical
  signing payload. Verifiers **MUST** recompute it from the envelope
  and reject the signature (fail) on mismatch: a mismatch means the
  context binding failed — wrong subject, claims, profile, purpose, or
  scope;
- `signature` — scheme-dependent hex encoding;
- `signedAt` (OPTIONAL) — asserted signing time. Receipts prove time;
  this is claimed;
- `purpose` (OPTIONAL, default `"artifact"`) — the intended purpose,
  bound into the payload. Profiles MAY define additional purposes
  (e.g. `"approval"`);
- `scope` (OPTIONAL) — organization/project scope bound into the
  payload, when the signer wants the signature valid only within that
  scope.

Because the payload binds protocol, version, purpose, profile, subject,
claims, and scope, a signature created for one context **cannot** be
replayed in another without the `payloadDigest` check failing (§16.2).

Receipts are deliberately **excluded** from the artifact signing
payload: they are produced after signing, and each is independently
verifiable on its own system. Binding the whole envelope, receipts
included, is the envelope signature's job.

### 8.3 Envelope signatures

An **envelope signature** answers: *who assembled, exported, or
approved this complete envelope — receipts included?* It signs the
**envelope signing payload** — the canonical JSON of:

```json
{
  "protocol": "fileonchain-evidence",
  "version": 1,
  "purpose": "envelope",
  "envelopeDigest": { "sha256": "<envelope digest, §12>" }
}
```

Envelope signatures are stored under `envelope.signatures`, **outside**
the digested region, so multiple envelope signatures can accumulate
without invalidating each other. Because the envelope digest covers
every receipt, claim, and artifact signature, an envelope signature
attests to the complete assembled envelope.

*Note (non-normative).* Typical division of labor: the author of a
software release makes the artifact signature; the build system that
gathered the settlement receipts and exported the final envelope makes
the envelope signature. For a legal document, the executing parties
sign the artifact; the escrow service that assembled receipts signs the
envelope.

### 8.4 Multiple and conflicting signatures

An envelope MAY carry any number of artifact signatures (an author and
an approver; an agent and its operator) over the same payload digest,
and any number of envelope signatures. Distinct envelopes over the same
subject with different signer sets are both valid documents; a verifier
reports exactly who signed what in each (§16.11).

## 9. Storage receipts

A storage receipt records where a copy of the subject bytes lives (or
that none was stored):

```json
{ "type": "storage", "adapter": "fileonchain-storage/v1", "payload": { … } }
```

- `type` **MUST** be `"storage"`.
- `adapter` names the receipt format (§9.1).
- `system` is OPTIONAL — the storage system's identifier where
  applicable.
- `payload` is defined entirely by the adapter.

Storage is a per-subject choice, never a protocol requirement: an
envelope with zero storage receipts (hash-only evidence) is fully
valid. Integrity is bound to digests, not locations — a dead URI does
not invalidate the evidence, it only makes the bytes harder to find.

### 9.1 Adapter naming

Every receipt's `adapter` **MUST** match
`^[a-z0-9][a-z0-9-]*(/v\d+)$` — a lowercase name plus a major version,
e.g. `"fileonchain-storage/v1"`. The adapter's own specification owns
the payload schema, offline checks, online checks, finality behavior,
and error states. A verifier without a registered adapter for a
receipt **MUST** report that receipt as *unknown*, never as failed.

*Note (non-normative).* The reference verifier registers
`fileonchain-storage/v1` and `fileonchain-storage-legacy/v1` (three
modes: `evidence-only`, `onchain-storage` with a
`fileonchain://<chainId>/<cid>` URI, `external-storage` with any URI),
plus the settlement and inclusion adapters listed in §13.

## 10. Settlement receipts

A settlement receipt records a transaction on a public settlement
system that fixed a digest at a block and time:

```json
{
  "type": "settlement",
  "adapter": "fileonchain-evm-anchor/v1",
  "system": "eip155:11155111",
  "payload": { "txHash": "0x…", "blockNumber": 123, … }
}
```

- `type` **MUST** be `"settlement"`; `system` is REQUIRED for
  settlement receipts.
- `system` identifies the settlement system. For blockchains, CAIP-2
  identifiers **SHOULD** be used (e.g. `eip155:1` for Ethereum
  mainnet); other systems use a stable namespaced identifier.
- `payload` is adapter-defined.

An envelope MAY carry settlement receipts from several systems.
**Multi-system settlement receipts are independent attestations**: each
says "this digest existed at this time on this system," and each stands
alone if another system becomes unavailable or untrusted. They are not,
and MUST NOT be described as, a proof between those systems — no system
verifies another system's consensus in this design.

Settlement receipts prove *inclusion* as of the check; treating a
receipt as settled is subject to the system's own finality behavior,
which the adapter documents (§16.8).

## 11. Manifest and inclusion receipts

Workloads producing many subjects need not settle each one
individually. The batching pattern:

1. Build a **manifest** — a document listing the subjects — and an
   envelope whose subject has `type: "manifest"`.
2. Build a **Merkle tree** over the subjects' SHA-256 digests.
   Construction is normative: leaves are lowercase-hex SHA-256 digests
   in manifest order; a parent is SHA-256 of the concatenation of its
   children's 64 raw bytes (left ‖ right); an odd node is paired with
   itself. Reference: [`packages/protocol/src/merkle.ts`](../../packages/protocol/src/merkle.ts).
3. Settle the **root** once on each chosen settlement system.
4. Give every subject's envelope an **inclusion receipt** carrying its
   proof.

The built-in inclusion adapter is `fileonchain-merkle/v1`, whose
payload is:

```json
{
  "root": "…64 hex…",
  "leafIndex": 0,
  "proof": ["…64 hex…", "…"],
  "leafDigest": "…optional; defaults to the subject's sha256…",
  "manifestDigest": "…optional sha256 of the canonical manifest…"
}
```

Verification recomputes the path from the leaf (the subject's `sha256`
digest when `leafDigest` is absent) through the proof to the root; the
check is pure and requires no I/O.

## 12. Envelope digests and signatures

The **envelope digest** is the SHA-256 (lowercase hex) of the canonical
JSON (§6) of the envelope **with the entire `envelope` member
removed**. Everything else — subject, claims, artifact signatures, all
receipts, extensions, `createdAt`, `id`, `profile` — is the *digested
region*.

Finalizing a draft stamps the digest into
`envelope.digest.sha256`. Consequences, all by construction:

- Adding, removing, reordering, or editing **any** receipt, claim,
  signature, or extension in the digested region changes the digest —
  a finalized envelope is tamper-evident end to end (§16.3).
- The digest cannot recurse: the `envelope` member is excluded from its
  own computation, so there is no digest-of-a-digest fixpoint problem
  (§16.4).
- Envelope signatures (§8.3), stored inside the excluded `envelope`
  member, can accumulate without changing the digest or invalidating
  one another.

When re-finalizing an envelope whose content changed, existing envelope
signatures whose payload digest no longer matches **MUST** be dropped:
they attest to a different envelope.

A draft (no `envelope` member) is structurally valid but its receipts
are not yet tamper-bound; verifiers report drafts as *incomplete*
(§14).

## 13. Verification algorithm

A conforming verifier, given an envelope (and optionally the subject
bytes and permission to make online checks), **MUST** perform the
following ordered checks and report each with a status from
`pass | fail | warning | unknown | skipped`. The reference
implementation is
[`packages/verify/src/envelope-verify.ts`](../../packages/verify/src/envelope-verify.ts).

**Step 1 — Schema.** Validate the structure of §4 (protocol id,
version, subject identification, namespace syntax, signature shapes,
receipt shells, timestamp formats). On failure, report `fail` and stop:
the overall result is *invalid*. Unknown claim namespaces and
extensions are **not** schema errors.

**Step 2 — Subject integrity.** If subject bytes were provided:
recompute SHA-256 and compare with `subject.digests.sha256` (`fail` on
mismatch; `warning` if bytes were provided but the subject carries no
sha256 to compare); if `subject.size` is present, compare byte lengths
(`fail` on mismatch). If no bytes were provided: report `skipped` when
a sha256 exists ("integrity not checked"), or `warning` when the
subject is identified only by URI or non-sha256 digests (nothing to
hash-check locally).

**Step 3 — Profile and claims.** If `profile` is set and registered,
run its validation (`pass`/`fail`). If it is set but **not**
registered, report `unknown` — the profile's claims were preserved but
not validated; this **MUST NOT** fail verification. Every claim
namespace not owned by the registered profile is reported `unknown`
("signed claims are assertions, not facts").

**Step 4 — Artifact signatures.** If there are none, report `warning`
("unsigned — integrity and timestamps only, no attribution"). For each
signature: recompute the artifact signing payload from the envelope's
subject, claims, profile, and the signature's purpose and scope; if
`payloadDigest` differs, `fail` (context binding failed) and skip the
cryptographic check. Otherwise verify the signature under its scheme
(`pass`/`fail`). Additionally report: the claimed identity binding as
`unknown` when `signer.id` is present; the delegation as `unknown`
(authorization present — validate out of band) or `warning` (no
authorization — claimed, not proven); and the key status as `unknown`
(with the `keyStatusUrl` when declared).

**Step 5 — Envelope digest and envelope signatures.** If the envelope
is a draft, report `warning` and mark the result *incomplete*
("receipts are not yet tamper-bound"). Otherwise recompute the envelope
digest (§12) and compare (`pass`/`fail`; a mismatch means content
changed after finalization). If there are no envelope signatures,
report `unknown` ("nobody attests to the assembled envelope as a
whole"); for each one, check its `payloadDigest` against this
envelope's digest (`fail` on mismatch) and verify the signature under
its scheme.

**Step 6 — Receipts, through their adapters.** For every receipt in
`storage`, `settlement`, and `inclusion` order: if no adapter is
registered for `receipt.adapter`, report `unknown` ("receipt preserved
but not checked") — **never** `fail`. Otherwise run the adapter's
offline check. Online checks run only when the caller requested them:
when requested, run the adapter's online check against public
endpoints (the caller may override endpoints per system identifier),
or report `unknown` if the adapter defines none; when not requested,
report `skipped` for adapters that define an online check.

Built-in adapters of the reference verifier:
`fileonchain-merkle/v1` (inclusion, pure),
`fileonchain-evm-anchor/v1` (EVM settlement; online check confirms the
transaction receipt and block against a public RPC endpoint and
reports inclusion, not finality), `fileonchain-anchor/v1` (settlement
on non-EVM systems, same payload shape; online confirmation reported
`unknown` with an explorer link where the reference verifier has no
client), `fileonchain-storage/v1` and the legacy adapters
`fileonchain-storage-legacy/v1` / `fileonchain-anchor-legacy/v1`
(§15.2).

## 14. Result semantics

The overall verification status is derived from the checks, in this
precedence order:

| Status | When |
| --- | --- |
| `invalid` | Any check failed. |
| `incomplete` | Nothing failed, but essential parts are missing or unchecked (e.g. a draft envelope with no envelope digest). |
| `valid-with-warnings` | Nothing failed and nothing essential is missing, but at least one check is `warning` or `unknown`. |
| `valid` | Every check passed. |

A verifier **MUST NOT** collapse uncertainty into a single green light:
unknown adapters, unknown profiles, unverifiable identity bindings,
unverifiable delegations, and unknown key status are all *unknown* —
distinguishable both from `pass` and from `fail`. The output of this
algorithm is **locally verified evidence**: a report of what was
checked and how, never a blanket statement that the envelope's claims
are true.

## 15. Versioning

### 15.1 Protocol, profiles, adapters

- The protocol version is the integer `version` member. This document
  specifies version 1. Breaking schema changes increment it; verifiers
  encountering an unsupported version fail the schema check.
- Profiles version in their identifier (`"org.fileonchain.agent/v1"`);
  a new major version is a new profile id.
- Adapters version in their identifier (`"fileonchain-evm-anchor/v1"`);
  a new major version is a new adapter id. Verifiers treat unknown
  versions like unknown adapters: *unknown*, preserved, not failed.

### 15.2 The legacy format

The pre-separation format — **`legacy-evidence-v1`**, recognizable by
`{ "p": "fileonchain-evidence", "v": 1 }` (note `p`, not `protocol`) —
remains verifiable forever through the reference verifier's legacy
path, and is convertible with the migration tool
(`fileonchain migrate`, backed by `migrateLegacyEvidence` in
[`packages/protocol/src/migrate.ts`](../../packages/protocol/src/migrate.ts)).
Migration maps storage/settlement records onto the legacy adapters
(`fileonchain-storage-legacy/v1`, `fileonchain-anchor-legacy/v1`) and
EVM chain ids onto CAIP-2 systems. Migration **MUST NOT** claim to
preserve original signatures as valid protocol signatures — the signing
payload changed shape, so they cannot verify; they are preserved
verbatim as legacy records under `extensions["org.fileonchain.legacy"]`
alongside a migration statement, and the migrated envelope carries no
artifact signatures of its own.

## 16. Security considerations

### 16.1 Canonicalization ambiguity

All signatures and digests depend on byte-identical canonical output
(§6). Three hazards deserve attention:

- **Duplicate JSON keys.** Standard parsers keep the last duplicate
  silently, so post-parse canonicalization cannot see duplicates in the
  wire form. Two wire documents differing only in a shadowed duplicate
  key canonicalize identically. Verifiers that must rule this out
  **SHOULD** scan the raw text for duplicate keys before parsing, and
  producers **MUST NOT** emit them.
- **Unicode non-normalization.** Strings are signed as the exact code
  points emitted. Visually identical strings in different normalization
  forms (e.g. NFC vs NFD) are different bytes and different digests.
  This is deliberate — normalizing inside the protocol would create
  implementation-divergence risk — but display layers should be aware
  that "same-looking" is not "same".
- **Numeric serialization.** Fractional numbers rely on the ECMAScript
  number-to-string algorithm; implementations in other languages must
  reproduce it exactly or the same envelope will digest differently.
  Producers **SHOULD** keep numbers to safe-range integers and encode
  anything else as strings.

### 16.2 Signature replay across purpose, profile, and scope

Without context binding, a signature collected for one purpose (say, a
routine artifact sign-off) could be replayed as a different one (say,
an approval), or a signature made inside one organization presented in
another. The artifact signing payload prevents this: it binds
`protocol`, `version`, `purpose`, `profile` (when set), `subject`,
`claims`, and `scope`. Any relocation of the signature — different
purpose, different profile, different claims, different org — changes
the payload, so the recorded `payloadDigest` no longer matches and the
verifier fails the signature at step 4 before any cryptography runs.

### 16.3 Receipt substitution, removal, and reordering

Artifact signatures deliberately do not cover receipts (§8.2), so on
their own they cannot detect a receipt being swapped for a weaker one,
silently dropped, or reordered. The envelope digest closes this: the
digested region includes all three receipt arrays in order, so any such
change alters the digest, failing step 5 on a finalized envelope.
Relying parties who care about receipt completeness **SHOULD** insist
on finalized envelopes and, ideally, at least one envelope signature.

### 16.4 Envelope digest recursion

The digest is defined over the envelope with the `envelope` member
removed, so the digest never covers itself and envelope signatures
never invalidate one another. There is no fixpoint computation and no
ambiguity about what the digest covers: everything except the
finalization block.

### 16.5 Malicious claims and extensions

Claims and extensions are preserved even when not understood, which
means an envelope can carry arbitrary attacker-chosen content in
unknown namespaces. Verifiers report such namespaces as *unknown* and
must present them as unvalidated assertions. Consumers **MUST NOT**
execute, render as trusted markup, or otherwise act on claim or
extension content merely because the envelope verifies — verification
proves who asserted the content, not that it is safe or true.

### 16.6 Unsupported signature schemes

A signature whose `scheme` is not one the verifier implements cannot be
checked. The schema requires `eip191` or `ed25519`; a conforming
verifier supports both (§17). Envelopes using additional schemes
(outside this version of the protocol) will fail the schema check
rather than silently pass — a deliberate fail-closed choice for the
attribution layer.

### 16.7 Revoked keys and unknown key status

A portable document cannot prove a key's status at any later time. A
compromised-then-revoked key still produces envelopes that verify
cryptographically. Mitigations: signers **SHOULD** declare
`keyStatusUrl`; verifiers always emit a key-status check that is
*unknown* unless resolved out of band; and settlement receipts give
relying parties a trustworthy *time* — a signature anchored before the
compromise window retains evidentiary value that a post-compromise one
does not.

### 16.8 Chain reorganizations and finality

A settlement receipt confirmed online proves inclusion at the moment of
the check, not finality. Blocks can be reorganized within a system's
finality window, taking the settlement transaction with them. Adapters
document the finality behavior of their systems; relying parties
**MUST** apply the settlement system's own finality depth before
treating a receipt as settled. The reference EVM adapter reports
"inclusion, not finality" explicitly.

### 16.9 Malicious RPC responses

Online receipt checks trust the endpoint they query. A malicious or
compromised endpoint can fabricate confirmations or denials. The
verifier lets callers override endpoints per system identifier, so a
relying party can query nodes it trusts, query several independently,
or run its own. Offline checks are unaffected: they are deterministic
over the envelope alone. Content addressing bounds the damage for
storage reads — bytes that do not hash to the subject digest are
rejected regardless of what the provider claims.

### 16.10 Merkle proof manipulation

Inclusion proofs are only as strong as the binding between the root and
a settlement receipt. An attacker who controls tree construction can
place arbitrary leaves in it, and the odd-node duplication rule means a
duplicated leaf pairs with itself — none of which lets an attacker
*forge* membership for a digest that is not in the tree (that requires
a SHA-256 collision), but relying parties should note: an inclusion
proof shows the subject digest is under the root; it says nothing about
what *else* is under the root, and it is meaningful only when the root
itself appears in a settlement receipt (or manifest) the relying party
accepts. Proofs **MUST** be checked against the root from the receipt,
never against a root supplied separately.

### 16.11 Conflicting signatures

Nothing prevents two envelopes over the same subject with different —
even contradictory — claims and signer sets. This is by design:
envelopes are evidence, not a global registry, and there is no
protocol-level uniqueness. A verifier reports exactly who signed what
in the envelope it was handed; resolving conflicts between envelopes
(which signer set to believe, which timestamp wins) is a relying-party
policy decision informed by settlement times and key trust.

### 16.12 Large-package denial of service

Envelopes are attacker-suppliable input. Deeply nested claims, very
long arrays of signatures or receipts, and multi-megabyte extensions
can exhaust a naive verifier's memory or CPU (canonicalization sorts
keys at every depth; every signature triggers cryptography). Verifiers
**SHOULD** enforce resource limits appropriate to their context —
maximum document size, nesting depth, and signature/receipt counts —
and fail the schema check rather than degrade. Producers **SHOULD**
keep envelopes small by referencing and hashing bulky material rather
than embedding it.

## 17. Conformance

A **conforming producer**:

- emits envelopes valid under §4–§12, with canonical encoding per §6
  used for every digest and signing payload;
- **MUST** support SHA-256 subject digests;
- **MUST NOT** emit duplicate JSON keys;
- **MUST** preserve unknown claims and extensions when re-emitting an
  envelope it did not author.

A **conforming verifier**:

- implements the ordered checks of §13 with the result semantics of
  §14;
- **MUST** support `sha256` digests and both signature schemes,
  `eip191` and `ed25519`;
- **MUST** implement canonical JSON per §6 byte-identically;
- **MUST** preserve unknown claims, extensions, profiles, and adapter
  receipts, reporting them as *unknown*, never as failures;
- **MUST NOT** require any network access for offline checks, and
  **MUST NOT** call any producer-operated service as part of
  verification.

## 18. Test vectors

The conformance fixtures live in
[`packages/protocol/fixtures/`](../../packages/protocol/fixtures/),
described by
[`manifest.json`](../../packages/protocol/fixtures/manifest.json). The
manifest's semantics: each entry names a fixture file and its
`expectedStatus` — the verifier result **without** subject bytes and
**without** online checks. The shared subject content for the
byte-check fixtures is the string
`agent run #42 output: all systems nominal`;
`wrong-subject-digest.json` additionally becomes `invalid` when
verified *with* those bytes.

The set covers: a minimal unsigned hash-only envelope; a signed
artifact; an Agent Evidence Profile envelope with wallet and delegated
agent signers; a fully-receipted, envelope-signed envelope; tampered
and removed receipts (envelope digest mismatch → `invalid`); a wrong
subject digest; a bit-flipped ed25519 signature (`invalid`); an
unregistered profile and an unknown extension (both preserved,
`valid-with-warnings`); and a `legacy-evidence-v1` package with its
migrated counterpart.

A conforming verifier **MUST** reproduce every `expectedStatus` in the
manifest.
