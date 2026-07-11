# FileOnChain

## One developer interface for portable, independently verifiable evidence packages across storage and settlement systems

**White paper · Version 2.0 · July 2026**

Marc-Aurèle Besner — [fileonchain.org](https://fileonchain.org) —
[github.com/FileOnchain](https://github.com/FileOnchain)

---

## Abstract

FileOnChain is one developer interface — a TypeScript SDK, a hosted API, and
an MCP server for AI agents — that turns an artifact into an **evidence
package**: a portable JSON document bundling the artifact's CID and
cryptographic hashes, the signatures and identities of whoever (or whatever)
produced it, storage receipts for where the bytes live, and settlement
receipts from the public chains that anchored it. A separate open-source
verifier — a library and a CLI, `fileonchain-verify evidence.json` —
validates a package deterministically and locally, without trusting
FileOnChain or calling any of its services.

Version 1 is deliberately narrow. It targets **developers building AI
agents and automated workflows** who need an independently verifiable
record of what a system produced, who or what produced it, when, and
whether it has changed. It launches on a small set of genuinely functional
integrations — Autonomys for permanent storage, EVM testnet registries for
contract-based settlement, Solana for portability — with every other chain
family shipped as a roadmap adapter with an explicit integration status.
There is no token, no staking, no validator set, and no on-chain
governance anywhere in v1: anchoring costs each chain's ordinary
transaction fee, and hosted services charge account credits or USDC. The
entire stack is open source under the MIT license.

---

## 1. Motivation

Automated systems now produce artifacts that people need to rely on:
agent-generated reports, code-generation outputs, tool-call logs,
deployment artifacts, automated approvals. Relying on them raises four
questions — *are these the original bytes? who or what produced them? when?
and can I check this myself?* — that today's infrastructure answers badly:

- **Receipts are not portable.** A notarization from one service is a row
  in that service's database, verified through that service's endpoint.
  When the service changes or disappears, so does the ability to verify.
- **Integrity without identity is half an answer.** A content hash proves
  bytes are unchanged; it says nothing about who created or approved them.
  Attribution needs signatures and key management, not just hashes.
- **Integration cost lands on the developer.** Teams that just want a
  tamper-evident record end up evaluating wallets, RPC providers, and
  payload formats per chain — complexity that has nothing to do with their
  product.

FileOnChain's answer is one narrow product: a developer interface that
produces evidence packages — self-contained, vendor-independent, and
verifiable by anyone with the open verifier — plus the small set of
integrations needed to store bytes durably and anchor claims on public
settlement systems.

## 2. The v1 customer and use case

Version 1 targets **developers building AI agents and automated
workflows**. The core use case:

> Create an independently verifiable record of what an agent or automated
> system produced, who or what produced it, when it was produced, and
> whether the artifact has changed.

Concrete examples: agent-generated reports, code-generation outputs,
tool-call logs, deployment artifacts, model and prompt metadata, financial
or operational instructions, research outputs, automated approval records.

Legal and compliance evidence, NFT media, archival preservation, and
consumer storage are **possible future applications**, not simultaneous v1
target markets. Where those users arrive early, the boundary is stated
plainly: an evidence package proves existence, integrity, signing keys,
and timing — it does not prove that a document is true, legally valid, or
factually accurate, and it does not by itself establish legal authorship
or admissibility.

## 3. The protocol layers

FileOnChain is specified as six independent layers. "Verify" means
something different at each layer, so the layers are named rather than
overloading the word:

1. **Content integrity** — hashing, CIDs, and manifests. SHA-256 digests
   and CIDv1 identifiers bind bytes to names; manifests and Merkle trees
   bind many artifacts to one root.
2. **Identity and attribution** — signatures and signer information.
   Wallet keys, organization keys, agent keys; delegation and key-status
   metadata.
3. **Storage** — where the bytes live: on-chain on a storage-capable
   network, on an external system, or nowhere (hash-only evidence). Each
   mode has an explicit receipt.
4. **Settlement and timestamping** — transactions on public chains (or
   other timestamp systems) that fix a hash or Merkle root at a block and
   time.
5. **Evidence packaging** — the versioned, canonical bundle of layers 1–4
   that travels as a file.
6. **Verification** — deterministic local validation of a package by the
   open verifier, with no FileOnChain service in the loop.

The layers compose but do not require each other: an unsigned hash-only
package is valid (integrity + time), and a fully signed, stored, and
anchored package is the same schema with more receipts.

## 4. The evidence package

### 4.1 Contents

An evidence package (`p: "fileonchain-evidence"`, `v: 1`, media type
`application/vnd.fileonchain.evidence+json`) contains, where applicable:

- **The artifact descriptor** — CIDv1, SHA-256 of the raw bytes, byte
  length, media type, name, and flat provenance metadata (model id, prompt
  hash, tool versions, run id — how the artifact was created).
- **Signatures** — zero or more, each carrying the signer's identity
  (`wallet`, `organization`, `agent`, `human`, or `service`), the public
  key or address, the scheme (`eip191`, `ed25519` in v1), an optional
  delegation statement (`onBehalfOf` — an agent signing for an
  organization), an optional key-status URL for rotation/revocation
  checks, and the hash of the canonical signing payload.
- **Storage receipts** — one per copy of the bytes: `evidence-only`
  (nothing stored), `onchain-storage` (a `fileonchain://<chainId>/<cid>`
  URI plus the transactions carrying the chunks), or `external-storage`
  (any URI the caller hosts).
- **Settlement receipts** — one per anchoring transaction: chain id,
  transaction hash, block number/hash, the chain's timestamp, and the
  anchor payload written, verbatim.
- **Merkle inclusion** — when the artifact was batch-anchored through a
  manifest (§6): the root, the leaf index, and the sibling proof path.
- **Session identifier** — ties the packages of one workflow together.

The schema is a core v1 protocol specification, implemented in
`packages/utils/src/evidence.ts` and shared byte-for-byte by the SDK, the
hosted API, the MCP server, and the webapp.

### 4.2 Canonical encoding

Signatures and package hashes are computed over a **canonical JSON form**:
object keys sorted lexicographically at every depth, arrays in order, no
insignificant whitespace, UTF-8. Every implementation must produce
byte-identical canonical output for the same package — the reference
implementation is `canonicalStringify`. The interchange form on disk is
ordinary human-readable JSON; only hashing and signing normalize to the
canonical form. (A compact binary canonical representation is a documented
candidate for a future schema version; v1 chooses debuggability.)

### 4.3 What a verifier can answer

Given a package (and, optionally, the artifact bytes), the verifier
answers exactly:

- **Are these the original bytes?** Recompute SHA-256 and compare.
- **Who signed them?** Check each signature against its embedded key, and
  report the claimed identity and delegation behind that key.
- **When were they signed or anchored?** Signing times are asserted;
  anchoring times come from settlement receipts, which any chain node can
  confirm.
- **Where are they stored?** Storage receipts name each copy and its mode.
- **Has the signing key been revoked?** Only if the signer declared a
  key-status endpoint — otherwise the verifier reports *unknown*, because
  a signature alone cannot prove non-revocation.
- **Can every receipt be independently verified?** Offline checks are
  deterministic; online receipt confirmation talks only to public RPC
  endpoints the verifier chooses.

## 5. Identity and signatures

A CID proves content integrity; it does not prove who created or approved
the content. v1 makes identity first-class:

- **Wallet signatures** — EIP-191 personal messages verified against an
  EVM address.
- **Agent and service keys** — ed25519 keys, the natural shape for
  server-side agents and CI systems.
- **Organization keys** — the same schemes held by an organization, with
  agents signing `onBehalfOf` the organization. v1 carries the delegation
  claim and an optional verifiable authorization statement; when the
  statement is absent, the verifier reports the delegation as *claimed,
  not proven*.
- **Multiple signers** — a package carries any number of signatures (an
  agent and its operator; an author and an approver).
- **Rotation and revocation** — keys are referenced by value, and each
  signer may declare a key-status URL where current validity can be
  checked. Revocation registries are deliberately out of the package
  format: a portable document cannot prove a key's future status, so the
  verifier surfaces status as a distinct, possibly-unknown check.

What is signed: the canonical form of the package identity and artifact
descriptor (including provenance metadata and session id) — not the
receipts, which are produced after signing and are each independently
verifiable on their own system.

## 6. Manifests and batch anchoring

Agent workflows produce many small artifacts; one settlement transaction
per artifact is wasteful. v1 supports:

- **Signed manifests** — a versioned document
  (`p: "fileonchain-manifest"`, `v: 1`) listing a workflow's artifacts
  (CID, SHA-256, name, metadata), with a session id and an optional parent
  root for hierarchical, parent-child evidence relationships.
- **Merkle batching** — a tree over the artifacts' SHA-256 digests
  (parent = SHA-256(left‖right), odd nodes paired with themselves). One
  settlement transaction anchors the root — hundreds or thousands of
  artifacts — while each artifact's evidence package carries its own
  inclusion proof.
- **The manifest anchor payload** — `op: "manifest"` with the root, the
  leaf count, the canonical manifest hash, and the session id, written
  through the same channels as any other anchor.

For agent logs, anchoring a signed manifest or Merkle root per session is
the recommended default — not storing every event on-chain.

## 7. Storage modes

Storage is a per-artifact choice, never a requirement. The developer picks
durability, privacy, and cost:

- **Evidence only** (default) — hash, signatures, timestamp. The bytes
  never leave the caller's custody. Right for most agent logs and anything
  sensitive.
- **Permanent storage plus evidence** — chunk bytes embedded in anchor
  transactions on a storage-capable chain, sized to the chain's
  per-transaction budget (64 KiB on Autonomys, the suggested storage home,
  down to bytes-per-transaction on tight transports). The storage receipt
  carries the `fileonchain://` URI and the chunk transactions.
- **External storage plus evidence** — the caller hosts bytes anywhere
  (IPFS, S3, Auto Drive, HTTPS) and the receipt records the URI. The
  package stays verifiable even if the URL later dies — integrity is bound
  to hashes, not locations.

Privacy defaults are conservative: hash-only anchoring is the default
mode; client-side encryption is supported before any storage; the hosted
API never receives plaintext file bytes unless the caller explicitly sends
them; and losing an encryption key makes encrypted permanent data
unrecoverable — permanence cuts both ways. FileOnChain is not a consumer
file locker and does not present permanent public storage as one.

## 8. Anchoring and settlement

### 8.1 The anchor payload

Every anchor, on every supported system, is one versioned JSON vocabulary
(`p: "fileonchain"`, `v: 1`) with three operations: `chunk` (one chunk of
a stored file, optionally carrying its bytes), `anchor` (a file-level
CID), and `manifest` (a Merkle root over a batch). Chunk anchors are
written first and the file-level anchor last, so indexers can finalize a
record in one pass.

### 8.2 What multi-chain anchoring means — and what it does not

Writing the same CID or root to several chains produces **multi-system
receipts**: independent, chain-native attestations that each say "this
hash existed at this time on this system." That is portable evidence —
if one chain becomes unavailable or untrusted, the other receipts stand
on their own.

It is **not** a cross-chain proof. No chain verifies another chain's
consensus or state in this design; writing a CID to chain B proves
nothing *about* chain A. FileOnChain therefore avoids the phrase
"cross-chain proof" everywhere and says what the thing is: multi-chain
anchoring, independently verifiable settlement receipts.

### 8.3 Retrieval honesty

Durability and retrieval depend on the selected storage system and the
availability of historical or archival infrastructure — not every
ordinary node retains and serves old transaction data forever. On a
purpose-built storage network (Autonomys), archival retention is the
protocol; on general-purpose chains, embedded bytes live in transaction
history whose long-term availability depends on archive nodes. Precisely:
**an artifact can be independently reconstructed and verified without
trusting the FileOnChain indexer, provided the underlying storage history
is available** — and an indexer is still normally required for efficient
CID-to-transaction discovery.

## 9. v1 integrations — honest statuses

v1 does not present twelve chain families as equally supported. Every
network in the registry carries an explicit `integrationStatus` on the
ladder *designed → implemented → tested locally → testnet deployed →
mainnet deployed → integrated into the webapp → production ready →
externally audited*, and product surfaces must not describe a network
beyond its status. The launch set:

| System | Role | Status |
| --- | --- | --- |
| Autonomys (mainnet + Taurus testnet) | Primary permanent-storage system; native remarks, no deployment needed | Integrated into the webapp |
| Solana (mainnet + devnet) | Non-EVM portability demonstration; native SPL Memo, no deployment needed | Integrated into the webapp |
| EVM — Ethereum Sepolia, Auto EVM Chronos | Contract-based settlement via the anchor-only FileRegistry | Testnet deployed |
| Auto EVM mainnet | EVM settlement target; flips active when the Chronos-tested registry lands | Testnet deployed (mainnet pending) |
| Aptos, Sui, Starknet, NEAR, Cosmos, TRON, Cardano, TON, Hedera | Roadmap adapters — SDK clients implemented, anchor-only contracts where needed | Implemented |

Mocked or partially implemented integrations are never described as
shipped; the registry's flags, not marketing copy, are the switch.

## 10. Trust and threat model

What a user must trust, per mode:

- **Always**: their own signing key custody; SHA-256 and the signature
  schemes; the canonical-encoding implementation.
- **When identity matters**: the binding between a key and a real-world
  identity (an identity provider, a published key, an organization's own
  attestation) — the package proves the key, not the person.
- **When storing on-chain**: the selected storage network's retention
  model and the availability of its archival infrastructure.
- **When anchoring**: the settlement network's consensus (including its
  reorganization behavior — receipts should be treated as final only past
  the chain's finality depth).
- **When retrieving**: the RPC and archive providers used for reads (any
  provider can be swapped; content addressing catches tampered responses).
- **When using the hosted API**: FileOnChain's execution — the worker
  signs and sends what the caller asked. Hash-only requests never expose
  artifact bytes; delegated execution is a convenience, never required
  for verification.
- **When encrypting**: the encryption implementation and the caller's key
  custody — key loss makes encrypted permanent data unrecoverable.

Failure modes the design accounts for: **key compromise** (rotate;
packages signed before rotation remain valid, which is why key-status
endpoints and settlement timestamps matter), **key revocation** (surfaced
as its own verifier check, *unknown* without a status endpoint),
**malicious metadata** (metadata is signed but not fact-checked — the
verifier proves who asserted it, not that it is true), **unavailable
storage providers** (evidence remains valid; bytes may not be
retrievable — receipts say where to look, hashes say what to expect),
**chain reorganizations** (respect finality depth before treating a
receipt as settled), **deleted external URLs** (integrity is
hash-bound, not location-bound), **conflicting signatures** (packages
with different signer sets over the same artifact are both reportable;
the verifier shows exactly who signed what and when it was anchored), and
**replay** (a package is bound to its artifact hash and session — reusing
a signature on different content fails the payload-hash check; reusing a
whole package for a different claim fails on the metadata it signed).

## 11. Access paths and the local verifier

- **`@fileonchain/verify`** — the most important component: an
  open-source verification library and CLI
  (`fileonchain-verify evidence.json [--artifact <file>] [--online]`).
  Verifies artifact hashes, manifest integrity, signatures and signer
  information, storage receipts, settlement receipts, Merkle inclusion
  proofs, and the package version and canonical encoding — deterministic,
  local, and independent of FileOnChain's API.
- **`@fileonchain/sdk`** — the umbrella TypeScript SDK: the evidence and
  manifest schemas, the chain registry with integration statuses, the
  payload vocabulary, storage budgets, and one anchoring client per chain
  family behind subpaths.
- **`@fileonchain/api`** — a zero-dependency client for the hosted API:
  FileOnChain's workers send anchors on the caller's behalf, paid with
  account credits (fiat/USDC). Hash-only by default — the hosted path
  never needs the artifact bytes.
- **`@fileonchain/mcp`** — a Model Context Protocol server, so AI agents
  can produce evidence packages without holding private keys.
- **The webapp** — the same interface with a UI: uploads (evidence-only,
  stored, or externally hosted), an explorer, cache payments, donations,
  and a credits dashboard.

## 12. Retrieval acceleration

The cache tiers make retrieval of stored bytes fast; they never replace
the chain: a **private cache** (client-side-encrypted chunks served for
the duration paid, settled in USDC) and a **donation-funded public cache**
(a free pin for public goods). Any cache node or mirror can vanish without
loss of verifiability — anyone holding bytes that hash to the anchored CID
holds the artifact.

## 13. What v1 explicitly does not include

There is no FOCAT token, no validator staking, no tips or bonds, no
challenge periods, no juries, no slashing, no token bridges, no token
voting, no governor or timelock, and no platform fee splits — in the
contracts, the SDKs, the API, the database, or the UI. Anchoring costs
each chain's ordinary transaction fee; hosted services charge ordinary
account credits, fiat, or USDC. An earlier experimental design for a
staked verification market is preserved, unmaintained, on the repository
branch `archive/focat-verification-market`; it is not part of the v1
architecture and nothing in v1 depends on it.

## 14. Acceptance criteria

v1 is complete when all of the following hold:

1. A developer can submit an artifact or an artifact hash.
2. The artifact can be signed by an agent, wallet, or organization key.
3. A portable evidence package is generated.
4. The package can optionally include a permanent-storage receipt.
5. The package can optionally include one or more settlement receipts.
6. A separate local verifier validates it without trusting FileOnChain.
7. The SDK, API, MCP server, and webapp use the same evidence schema.
8. All advertised integrations are deployed and genuinely functional.
9. No active v1 flow depends on FOCAT, validators, juries, bridges, or
   token governance.

## 15. Conclusion

FileOnChain v1 is one developer interface that creates portable,
independently verifiable evidence packages across storage and settlement
systems — and an open verifier that makes "independently" literal. The
protocol is six small layers: hashes and manifests for integrity,
signatures for attribution, explicit storage modes, chain-native
settlement receipts, a canonical package format, and deterministic local
verification. It launches narrow — agents and automated workflows, a
handful of honest integrations — and grows by adding adapters and
receipts, not promises.

---

## References

- Protocol source (monorepo): <https://github.com/FileOnchain/fileonchain-org>
- Evidence-package schema: [`packages/utils/src/evidence.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/evidence.ts)
- Manifests & Merkle batching: [`packages/utils/src/manifest.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/manifest.ts)
- Local verifier: [`packages/verify`](https://github.com/FileOnchain/fileonchain-org/tree/main/packages/verify)
- Chain registry & integration statuses: [`packages/utils/src/chains.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/chains.ts)
- Anchor payload vocabulary: [`packages/utils/src/anchor.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/anchor.ts)
- Storage budgets and URIs: [`packages/utils/src/storage.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/storage.ts)
- Anchor-only contracts (five runtimes): [`contracts/`](https://github.com/FileOnchain/fileonchain-org/tree/main/contracts)
- Archived market experiment: [`archive/focat-verification-market`](https://github.com/FileOnchain/fileonchain-org/tree/archive/focat-verification-market)
- Autonomys (permanent storage network): <https://www.autonomys.xyz/>
- CIDs / content addressing: <https://docs.ipfs.tech/concepts/content-addressing/>

---

*FileOnChain is open source under the MIT license. This document describes
protocol version 1: the evidence-package schema v1, the anchor payload
vocabulary v1, and the manifest format v1.*
