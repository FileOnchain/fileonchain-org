# FileOnChain

## One developer interface for portable, independently verifiable evidence packages across storage and settlement systems

**White paper · Version 1.1 · July 2026**

Marc-Aurèle Besner — [fileonchain.org](https://fileonchain.org) —
[github.com/FileOnchain](https://github.com/FileOnchain)

---

## Abstract

FileOnChain is one developer interface — a TypeScript SDK, a hosted API, and
an MCP server for AI agents — that turns a file or record into an **evidence
package**: a portable bundle of its content identifier (CID), versioned
anchor payloads, and transaction receipts on the public settlement systems
the caller chooses. Anyone holding the package can verify it independently
against public infrastructure — recompute the CID from the bytes, look up
the receipts on any node or explorer, decode the payloads with an open
vocabulary — without trusting FileOnChain or any other service. Behind the
interface, one payload format is written identically across twelve chain
families, from EVM and Substrate to Cardano, TON, and Hedera; that breadth
is an implementation detail the integrator never has to manage. When the
use case genuinely wants the bytes on-chain, the same interface embeds
chunk data in the anchors on a storage-capable chain (Autonomys, a
permanent-storage network, is the suggested home); callers who host bytes
elsewhere anchor proof-only and point at their copy. Version 1 is
deliberately narrow: it ships anchoring, evidence packages, optional
on-chain storage, and retrieval — and it does **not** ship the staked
validator market, dispute juries, token bridges, or token governance, which
are documented as a staged roadmap and previewed on testnets only. The
entire stack is open source under the MIT license.

---

## 1. Motivation

The web forgets, and evidence doesn't travel. Links rot, platforms shut
down, files are silently edited, and there is rarely a way to prove that a
record existed in a particular form at a particular time — let alone a way
to hand that proof to an auditor, a counterparty, or a court and have them
check it themselves. Public blockchains are the most durable,
tamper-evident timestamping medium ever deployed, yet using them for
evidence remains fragmented:

- **Receipts are not portable.** A notarization from one service is a row
  in that service's database, verified through that service's endpoint.
  When the service changes or disappears, so does the ability to verify.
- **Every chain is a silo.** A hash written via one ecosystem's conventions
  is invisible to tooling built for another; each chain reinvents its own
  ad-hoc format, and each integration is a new project.
- **Integration cost lands on the developer.** Teams that just want
  "tamper-evident proof of this record" end up evaluating wallets, RPC
  providers, and payload formats per chain — complexity that has nothing to
  do with their product.

FileOnChain addresses all three with one narrow product: a single
developer interface that produces **evidence packages** — self-contained,
vendor-independent, verifiable by anyone against public infrastructure —
and one payload vocabulary that makes the same evidence readable on every
supported settlement system.

## 2. Who FileOnChain serves — and who it does not

Different customers need very different things from "proof". Version 1 is
scoped honestly against those needs:

- **Developers and platform builders — the primary customer.** What they
  need is a simple API and SDK, not a survey of twelve ecosystems. The
  interface is one call: hand it bytes or a CID, get back an evidence
  package. Which chains sit behind that call is configuration, not
  homework — the twelve-family support exists so the integrator never has
  to migrate, not so they have to choose twelve times.
- **AI-agent platforms — the primary early use case.** Agents need
  tamper-evident action logs and reproducible evidence of what they did and
  when. The right shape is anchoring the *hash* of each log segment or
  decision record as it is produced — not replicating every artifact across
  chains. Evidence packages are exactly that: cheap, per-event,
  independently checkable.
- **Legal and compliance teams — served through integrators, with the
  boundary stated plainly.** An anchor proves that specific content existed
  at a specific time, and its integrity ever since. It does **not**
  establish identity, authorship, signature, retention policy, or
  admissibility — those come from the systems layered on top (e-signature,
  identity providers, records management). The evidence package is designed
  to slot into those systems as the integrity layer, not to replace them.
- **NFT and media platforms.** Supported where genuinely-on-chain media is
  the point of the product. Where a simpler storage option fits, use it —
  FileOnChain does not pretend to be the cheapest place to put a JPEG.
- **Researchers and archives.** Long-term preservation and public
  retrieval are what the donation-funded public cache and the on-chain
  storage path are for. This is a public-goods commitment, not a
  commercial pillar.
- **Ordinary consumers — not the v1 audience.** Permanent public
  blockchain storage is the wrong default for personal files; consumers
  need privacy, recovery, and Dropbox-grade usability. Consumer products
  may be built on this interface by others; FileOnChain itself does not
  sell to consumers in v1.

## 3. Design principles

1. **One interface, many systems.** The integrator writes to one SDK/API
   surface with one payload vocabulary and one receipt shape. Chains are
   configuration behind it. Supporting twelve families is FileOnChain's
   maintenance burden, never the caller's.
2. **Evidence must outlive the service.** An evidence package is complete
   in itself: the CID, the payloads, the receipts. Verifying one needs
   public infrastructure only — a node or explorer of the settlement chain
   and an open decoding vocabulary — never a FileOnChain endpoint.
3. **Content addressing over location addressing.** Files and records are
   identified by CIDv1 hashes. A CID is valid forever and verifiable by
   anyone holding the bytes, wherever they were found.
4. **Chain-agnostic by construction.** The payload written on-chain is
   byte-identical on every family. Chains differ only in the transaction
   envelope — a contract call, a remark, a memo, transaction metadata, or a
   consensus message — and in how many bytes one transaction can carry.
5. **Storage is opt-in, not the point.** Anchoring proves; storage
   preserves. The interface stores bytes on-chain when the use case wants
   it and anchors proof-only when it doesn't — most evidence use cases
   don't.
6. **Ship the narrow thing first.** v1 contains no token requirement, no
   staking, no governance vote. Economic layers are roadmap (§8), added
   only if and where demand proves them out.
7. **Open everything.** Contracts, SDKs, the webapp, the API surface, and
   this document are MIT-licensed and developed in the open.

## 4. The evidence package

### 4.1 What a package contains

Producing evidence for a file (or folder — a folder is handled exactly like
a file, via the CID of its DAG root) yields a portable bundle:

- **The CID** — a CIDv1 over SHA-256, recomputable by anyone holding the
  bytes.
- **The anchor payloads** — the versioned JSON documents written on-chain
  (§4.2), identical on every family.
- **The receipts** — for each settlement system used: chain id,
  transaction hash(es), and the block/timestamp the chain assigned.
- **Optionally, a storage URI** — where the bytes live (§4.4), on-chain or
  external.

Verification is mechanical and needs no permission: recompute the CID from
the bytes, fetch the referenced transactions from any public node or
explorer of each chain, decode the payloads with the open vocabulary, and
check that the CIDs match. The package is a file; hand it to whoever needs
to check it.

### 4.2 The anchor payload

Every anchor — data-carrying or proof-only, on every chain — is the same
versioned JSON document, identified by the protocol tag
`p: "fileonchain"` and version `v: 1`.

**Chunk-level anchor** — one per chunk; carries the file's bytes when the
chain is the storage home:

| Field | Type | Meaning |
| --- | --- | --- |
| `p` | `"fileonchain"` | Protocol tag |
| `v` | `1` | Payload version |
| `op` | `"chunk"` | Operation |
| `cid` | string | CIDv1 of this chunk |
| `fileCid` | string | CIDv1 of the whole file |
| `idx` | number | Zero-based chunk index |
| `total` | number | Total chunks in the file |
| `next` | string, optional | CIDv1 of the next chunk (omitted on the last) |
| `d` | string, optional | **The chunk's bytes** (base64) — present on the storage chain |

**File-level anchor** — one per file (or folder DAG root):

| Field | Type | Meaning |
| --- | --- | --- |
| `p` / `v` | as above | Protocol tag and version |
| `op` | `"anchor"` | Operation |
| `cid` | string | CIDv1 of the file or folder DAG root |
| `sha256` | string, optional | SHA-256 (hex) of the raw content |
| `uri` | string, optional | Where the bytes live (§4.4) |
| `pid` | string, optional | Originating platform id (integrator attribution) |

Three properties follow from this design:

- **The file is reconstructible from the chain alone** when stored
  on-chain: walking the chunk trail (`fileCid` + `idx`/`next` ordering) and
  base64-decoding each `d` field rebuilds the file, and every chunk's CID
  verifies its bytes. No off-chain index is required.
- **One indexer reads every chain.** `parseAnchorPayload` decodes an anchor
  whether it was found in an EVM event, a Substrate remark, a Solana memo,
  Cardano transaction metadata, or a Hedera consensus message.
- **Attribution travels with the payload.** The `pid` field carries the
  originating platform on every family — including memo-only chains with no
  contract to enforce it.

### 4.3 Chunking, for storage

When bytes are stored on-chain, the file is processed client-side:

1. The bytes are split into chunks **sized to the storage chain's
   per-transaction data budget** (§5.2) — 64 KiB where the chain allows it,
   smaller where the transport is tighter.
2. Each chunk is hashed with SHA-256 and encoded as a **CIDv1**.
3. Chunk CIDs are linked into a forward-chained sequence — each chunk
   anchor names the CID of the next — and the file itself is identified by
   its root CID.

Hashing and slicing happen in the browser or the caller's own process; for
proof-only anchors the raw bytes never leave the caller's machine, and for
storage the bytes go directly from the user's wallet to the chain.

### 4.4 Storage URIs — evidence points at the bytes

When the bytes live on one chain and proofs on others, every file-level
anchor carries a `uri` naming the storage home:

```
fileonchain://<chainId>/<fileCid>      e.g. fileonchain://substrate:autonomys-mainnet/bafy…
```

A reader who finds the anchor on, say, Base resolves the URI to the storage
chain, walks the chunk trail there, and verifies the rebuilt bytes against
the anchored CID. Callers who host bytes elsewhere set the `uri` to any
external location instead — `ipfs://…`, an Auto Drive CID, `https://…` —
or omit it entirely for a pure existence proof.

### 4.5 Anchoring order

Chunk anchors are always written **first**, and the file-level anchor
**last**. Indexers rely on this ordering: when a file-level anchor appears,
its chunk trail — and, on the storage chain, the file's full data — is
already on-chain, so the file record can be finalized in a single pass.

## 5. Chain families, transports, and storage budgets

### 5.1 Transports

FileOnChain v1 spans **twelve chain families** — at the time of writing, 55
registered networks (28 mainnets and 27 testnets). Each family anchors
through the most native channel its runtime offers:

| Family | Transport | Deployment required |
| --- | --- | --- |
| EVM | `FileRegistry` contract call per chunk + file | Contract |
| Substrate | `system.remarkWithEvent`, batched via `utility.batchAll` | None (native remarks) |
| Solana | SPL Memo program | None (native program) |
| Aptos | Move module `file_registry::anchor_cid` | Move package |
| Cosmos | Transaction memo, one payload per transaction | None (native memo) |
| Sui | Move calls batched into one programmable transaction block | Move package |
| Starknet | `anchor_cid` multicalls on the Cairo `FileRegistry` | Cairo contract |
| NEAR | `anchor_cid` on the WASM registry contract | Rust contract |
| TRON | Transaction data/memo field | None in memo mode |
| Cardano | CIP-20 transaction metadata (label 674) | None (native metadata) |
| TON | Text comment on a minimal self-transfer | None (native comment) |
| Hedera | Consensus Service message on a registry topic | HCS topic |

### 5.2 Storage budgets

Any chain whose transport can carry a meaningful slice of data is a valid
**storage chain** — the user picks, guided by per-chain cost estimates. The
protocol assigns each family a per-transaction payload budget; after the
JSON envelope and base64 inflation, the raw bytes one chunk anchor can
store are:

| Family | Raw data per transaction | Storage character |
| --- | --- | --- |
| Substrate (Autonomys) | 64 KiB | **Suggested home** — permanent-storage network, embeds bytes by default, cheapest for large files |
| EVM | 64 KiB | Calldata storage; costs scale with gas price — practical on L2s, expensive on Ethereum L1 |
| NEAR | ~48 KiB | Function-call args |
| Aptos | ~36 KiB | Entry-function arg |
| Starknet | ~24 KiB | ByteArray calldata |
| Sui | ~12 KiB | PTB pure argument |
| Cardano | ~5.8 KiB | CIP-20 metadata |
| TRON | ~1.3 KiB | Memo field |
| Hedera | 512 B | One HCS message per chunk |
| TON | 448 B | Transfer comment |
| Solana | 256 B | Memo — viable for very small files only |
| Cosmos | — | Memos (256 B default) can't fit the envelope plus data: anchor-only |

The uploader derives the chunk size from this budget, so a file stored on
Autonomys is a handful of 64 KiB chunks while the same file on Hedera is
many 512-byte messages — the interface shows the transaction count and cost
for every candidate before anything is signed. Tiny budgets make storage
*possible* everywhere the physics allow, not *sensible* everywhere: the
suggested path stores medium and large files on Autonomys and anchors
proofs wherever the user needs them.

### 5.3 The chain registry

The chain registry — `packages/utils/src/chains.ts` — is the protocol's
single source of truth: every network entry carries its RPC endpoints,
explorer URL templates, deployed contract/module/program/topic identifiers,
a rollout status (`active`, `planned`, `deprecated`), and its storage
character (`embedsChunkData` marks storage-first networks that embed bytes
by default). A chain is **provisioned** when its entry carries a live
deployment (or needs none); anchoring against an unprovisioned chain fails
fast with a typed error so callers can fall back or choose another network.

## 6. Retrieval and the cache tiers

The storage chain is the file's home; the cache tiers exist to make
retrieval *fast* and, when wanted, *private* — they accelerate, they never
replace:

- **Reading straight from the chain.** Anyone can rebuild a stored file
  from the storage chain's history: walk the chunk trail, decode the `d`
  fields, verify against the CIDs. This is the trust-minimized path and it
  requires nothing from FileOnChain.
- **Private cache (paid).** Chunks are encrypted client-side with a key
  only the uploader (and their sharees) hold; cache nodes serve ciphertext
  at CDN speeds for the duration paid, and never see plaintext. Payments
  settle in USDC through the `CachePayments` contract.
- **Public cache (donation-funded).** A free pin for public goods —
  research data, archives, open-source releases. Donations in the chain's
  native coin route through the `DonationEscrow` contract to cache node
  operators.

Because content addressing verifies bytes wherever they come from, a cache
node — or any mirror — can vanish without loss: the chain still holds the
file, and anyone holding bytes that hash to the anchored CID holds the
file.

## 7. Access paths

The product **is** the interface. Everything on fileonchain.org runs on the
same open-source packages anyone can use:

- **`@fileonchain/sdk`** — the umbrella TypeScript SDK: the chain registry,
  payload vocabulary, and storage budgets at the root, one client per
  family behind subpaths (`/evm`, `/substrate`, … `/hedera`). Every family
  exposes the same `anchorChunkedFile` with an `includeData` switch for
  on-chain storage and identical progress and receipt shapes. Nine of the
  twelve clients are fully dependency-free.
- **`@fileonchain/api`** — a zero-dependency client for the hosted API:
  FileOnChain's workers sign and send proof anchors, paid with account
  credits under `fok_` API keys. Hosted anchoring never receives file
  bytes — storage stays wallet-signed (or rides Auto Drive BYOK keys on
  Autonomys).
- **`@fileonchain/mcp`** — a Model Context Protocol server exposing registry
  lookups, CID validation, and API-backed anchoring as tools, so AI agents
  can produce evidence packages without holding private keys.
- **The webapp** — the same interface with a UI: wallet-signed uploads,
  proof-only or stored, an explorer over anchored CIDs, cache payments,
  donations, and a credits-based dashboard.

## 8. Roadmap — deliberately not in v1

Earlier drafts of this protocol bundled an economic verification layer into
version 1. It is now explicitly out of scope for v1 and staged as roadmap,
to be shipped only where real usage proves the demand:

- **A staked verification market.** File-level anchors could graduate from
  timestamps to economically backed claims: a proposer escrows a token tip
  and bond, the claim survives a challenge window, and staked validators
  earn the tip for policing it.
- **Dispute juries.** Contested claims resolved by juries drawn from the
  validator set, with losing bonds and losing jurors slashed.
- **Token bridging.** A single global token supply moved across runtimes by
  governance-approved burn/mint bridges (ERC-7802 on EVM).
- **Token governance.** Parameters, treasury, and upgrades owned by token
  holders through an on-chain Governor and timelock.

Contract suites implementing this design exist in the repository and run on
**testnets as previews**; the design is specified in
[`docs/governance.md`](https://github.com/FileOnchain/fileonchain-org/blob/main/docs/governance.md).
Nothing in v1 depends on them: no v1 flow requires a token, and every
evidence package produced today remains verifiable unchanged if and when
the market layer ships.

## 9. Security considerations and known limitations

Design choices and their trade-offs, stated plainly:

- **Anchoring proves existence and integrity, not authorship or
  truthfulness.** An evidence package shows that specific bytes existed at
  a specific time and are unchanged. It does not establish who authored
  them, whether a signature is valid, or whether the contents are true —
  identity, signatures, and retention policy belong to the systems layered
  on top.
- **On-chain bytes are public and permanent.** Anything stored unencrypted
  is world-readable forever — that is the point, and also the warning.
  Sensitive content belongs in the encrypted private cache, or encrypted
  client-side before storage — or should be anchored proof-only, which is
  the right default for most evidence use cases.
- **Data durability equals the storage chain's history retention.** On a
  purpose-built storage network (Autonomys) archival is the protocol; on
  general-purpose chains, embedded bytes live in transaction history (e.g.
  EVM calldata), whose long-term availability depends on archive nodes.
  Choosing the storage chain is choosing its retention model.
- **Small-budget chains make storage possible, not economical.** A 1 MB
  file is ~16 transactions on Autonomys and ~2,000 on Hedera. The uploader
  surfaces transaction counts and costs before signing; the suggested
  default avoids the pathological cases.
- **Roadmap contracts are previews.** The verification-market suite runs on
  testnets only; its threat model (jury randomness, vote privacy, bridge
  rate limits) is documented with the roadmap and must be hardened before
  any mainnet deployment.

The contracts target ≥95% test coverage per runtime.

## 10. Implementation status

FileOnChain ships honestly: **anchoring and storage are real wherever a
chain is provisioned**, and the registry's provisioning flags — not
marketing copy — are the switch. At the time of writing:

- The payload vocabulary (including data-carrying chunks), the per-family
  storage budgets, all twelve family clients with the `includeData` storage
  switch, the hosted API, and the MCP server are built and open source.
- Per-chain rollout is tracked in the chain registry: each network flips to
  real storage and anchoring when its contracts, modules, topics, or native
  channels are deployed, recorded, and QA'd. Memo-based anchoring on
  mainnets (Cosmos, TRON, Cardano, TON) is enabled deliberately per network
  after testnet QA.
- The roadmap contract suites (§8) exist for five runtimes
  (Solidity/Foundry, Move on Aptos and Sui, Cairo, Rust/NEAR) and run on
  testnets as previews; they are not part of the v1 product surface.
- Surfaces not yet wired to live deployments (registry reads in the
  explorer, cache fulfillment) run against a clearly marked deterministic
  mock layer whose call signatures match the real integrations, so the
  seams swap without breaking callers.

## 11. Conclusion

FileOnChain is one developer interface that creates portable, independently
verifiable evidence packages across storage and settlement systems. One
payload vocabulary makes the same evidence readable on twelve chain
families; receipts and CIDs make every package checkable against public
infrastructure with no service in the loop; optional on-chain storage —
with a permanent-storage network as the suggested home — keeps the bytes
themselves retrievable where a use case wants that. The protocol is
deliberately minimal at its core — a JSON document, a hash, and a receipt —
and deliberately honest at its edges: the economic verification layer is a
staged roadmap, not a v1 promise, and each chain flips to real only as its
deployment lands.

---

## References

- Protocol source (monorepo): <https://github.com/FileOnchain/fileonchain-org>
- Chain registry (single source of truth): [`packages/utils/src/chains.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/chains.ts)
- Anchor payload vocabulary: [`packages/utils/src/anchor.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/anchor.ts)
- Storage budgets and URIs: [`packages/utils/src/storage.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/storage.ts)
- Contract suites, including roadmap previews (five runtimes): [`contracts/`](https://github.com/FileOnchain/fileonchain-org/tree/main/contracts)
- Roadmap: verification market & governance design: [`docs/governance.md`](https://github.com/FileOnchain/fileonchain-org/blob/main/docs/governance.md)
- SDK documentation: <https://fileonchain.org/docs>
- Protocol overview: <https://fileonchain.org/protocol>
- Autonomys (permanent storage network): <https://www.autonomys.xyz/>
- CIDs / content addressing: <https://docs.ipfs.tech/concepts/content-addressing/>
- CIP-20 (Cardano transaction message metadata): <https://cips.cardano.org/cip/CIP-20>

---

*FileOnChain is open source under the MIT license. This document describes
protocol version 1; the verification-market design referenced in §8 is a
roadmap that will be specified fully in a future revision if it ships.*
