# FileOnChain

## Permanent on-chain file storage with cross-chain proofs

**White paper · Version 1.0 · July 2026**

Marc-Aurèle Besner — [fileonchain.org](https://fileonchain.org) —
[github.com/FileOnchain](https://github.com/FileOnchain)

---

## Abstract

FileOnChain is an open protocol for storing files on public blockchains and
proving them everywhere. A file is split into chunks sized to a chain's
per-transaction budget, and the chunk bytes themselves are embedded in
anchor transactions on a **storage chain** the user chooses — the chain they
were anchoring on anyway when it can carry data, or Autonomys, a
permanent-storage network, suggested for anything large. The file is then
**anchored** — its content identifier (CID) committed with a pointer to the
stored copy — on any number of the twelve supported chain families, from EVM
and Substrate to Cardano, TON, and Hedera, using one versioned payload
vocabulary that any indexer can read back regardless of chain. On chains
with smart-contract runtimes, anchors graduate from timestamps to *verified
claims* through an optimistic verification market: a proposer escrows a
token tip and bond, the claim survives a 24-hour challenge window policed by
staked validators, and the tip is split between the validators who secure
the market, the platform that originated the anchor, and a
community-governed treasury. Users who already host their bytes elsewhere
can opt out of on-chain storage and point their anchors at any external
location. The entire stack — contracts on five runtimes, twelve TypeScript
clients, a hosted API, and an MCP server for AI agents — is open source
under the MIT license.

---

## 1. Motivation

The web forgets. Links rot, platforms shut down, files are silently edited,
and there is rarely a way to prove that a document existed in a particular
form at a particular time — let alone to still *retrieve* it years later.
Public blockchains are the most durable, tamper-evident storage medium ever
deployed, yet using them for files remains fragmented:

- **Files don't actually live on chain.** Most "on-chain storage" projects
  write a hash and store the bytes somewhere else — a pinning service, a
  gateway, a company server. When that host disappears, the hash proves a
  file existed that nobody can read anymore. A protocol named FileOnChain
  should put the file on the chain.
- **Every chain is a silo.** Bytes stored via one ecosystem's conventions
  are invisible to tooling built for another; each chain reinvents its own
  ad-hoc format for both data and proofs.
- **Proofs are unverified.** A transaction proves *someone wrote a hash at
  a time* — it says nothing about whether the claim is well-formed,
  attributable, or worth trusting. No economic layer puts skin in the game
  behind it.

FileOnChain addresses all three. It **stores the file on chain by
default** — chunk bytes embedded in the same anchor transactions that prove
it, on whichever supported chain the user picks as the storage home. It
defines **one payload vocabulary** for data and proofs that works
identically across twelve chain families, so anchors on every other chain
can point back at the stored copy. And it adds an **optimistic verification
protocol** that turns anchors into economically backed claims on
contract-capable chains.

## 2. Design principles

1. **The chain is the storage medium.** By default the file's bytes are
   written into the chain's own history — no pinning service, no canonical
   host, no company that can turn it off. Retrieval needs nothing but a
   node (or archive) of the storage chain.
2. **The user picks where bytes live.** Any storage-capable chain can be
   the file's home. The anchoring chain is the default; Autonomys — a
   network purpose-built for permanent data storage, whose anchors embed
   bytes natively — is the suggested home for medium and large files, where
   it is cheapest. Users who already host bytes elsewhere opt out and link
   their copy instead.
3. **Content addressing over location addressing.** Files are identified by
   CIDv1 hashes. A CID is valid forever and verifiable by anyone holding
   the bytes, wherever they were found.
4. **Chain-agnostic by construction.** The payload written on-chain is
   byte-identical on every family. Chains differ only in the transaction
   envelope — a contract call, a remark, a memo, transaction metadata, or a
   consensus message — and in how many bytes one transaction can carry.
5. **Optimistic verification.** Most anchors are honest, so the fast path
   is cheap: propose, wait out a challenge window, finalize. Disputes are
   the expensive exception, resolved by juries drawn from staked
   validators.
6. **Open everything.** Contracts, SDKs, the webapp, the API surface, and
   this document are MIT-licensed and developed in the open.

## 3. System overview

### 3.1 Content addressing and chunking

A file (or folder — a folder is handled exactly like a file, via the CID of
its DAG root) is processed client-side:

1. The bytes are split into chunks **sized to the storage chain's
   per-transaction data budget** (§4.2) — 64 KiB where the chain allows it,
   smaller where the transport is tighter.
2. Each chunk is hashed with SHA-256 and encoded as a **CIDv1**.
3. Chunk CIDs are linked into a forward-chained sequence — each chunk
   anchor names the CID of the next — and the file itself is identified by
   its root CID.

Hashing and slicing happen in the browser or the caller's own process; for
proof-only anchors the raw bytes never leave the uploader's machine, and
for storage the bytes go directly from the user's wallet to the chain.

### 3.2 The anchor payload

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
| `uri` | string, optional | Where the bytes live (§3.3) |
| `pid` | string, optional | Originating platform id (integrator attribution) |

Three properties follow from this design:

- **The file is reconstructible from the chain alone.** On the storage
  chain, walking the chunk trail (`fileCid` + `idx`/`next` ordering) and
  base64-decoding each `d` field rebuilds the file, and every chunk's CID
  verifies its bytes. No off-chain index is required.
- **One indexer reads every chain.** `parseAnchorPayload` decodes an anchor
  whether it was found in an EVM event, a Substrate remark, a Solana memo,
  Cardano transaction metadata, or a Hedera consensus message.
- **Attribution travels with the payload.** The `pid` field carries the
  originating platform on every family — including memo-only chains with no
  contract to enforce it.

### 3.3 Storage URIs — proofs point at the bytes

When the bytes live on one chain and proofs on others, every file-level
anchor carries a `uri` naming the storage home:

```
fileonchain://<chainId>/<fileCid>      e.g. fileonchain://substrate:autonomys-mainnet/bafy…
```

A reader who finds the anchor on, say, Base resolves the URI to the storage
chain, walks the chunk trail there, and verifies the rebuilt bytes against
the anchored CID. Users who opted out of on-chain storage may set the `uri`
to any external location instead — `ipfs://…`, an Auto Drive CID, `https://…`
— or omit it entirely for a pure existence proof.

### 3.4 Anchoring order

Chunk anchors are always written **first**, and the file-level anchor
**last**. Indexers rely on this ordering: when a file-level anchor appears,
its chunk trail — and, on the storage chain, the file's full data — is
already on-chain, so the file record can be finalized in a single pass.

## 4. Chain families, transports, and storage budgets

### 4.1 Transports

FileOnChain v1 spans **twelve chain families** — at the time of writing, 55
registered networks (28 mainnets and 27 testnets). Each family anchors
through the most native channel its runtime offers:

| Family | Transport | Deployment required |
| --- | --- | --- |
| EVM | `FileRegistry` contract call per chunk + file; paid `proposeAnchor` for verification | Contract suite |
| Substrate | `system.remarkWithEvent`, batched via `utility.batchAll` | None (native remarks) |
| Solana | SPL Memo program | None (native program) |
| Aptos | Move module `file_registry::anchor_cid`; `anchor_registry` for the protocol | Move package |
| Cosmos | Transaction memo, one payload per transaction | None (native memo) |
| Sui | Move calls batched into one programmable transaction block | Move package |
| Starknet | `anchor_cid` multicalls on the Cairo `FileRegistry` | Cairo contracts |
| NEAR | `anchor_cid` on the WASM registry contract | Rust contracts |
| TRON | Transaction data/memo field (the EVM Solidity suite compiles for TVM as an upgrade path) | None in memo mode |
| Cardano | CIP-20 transaction metadata (label 674) | None (native metadata) |
| TON | Text comment on a minimal self-transfer | None (native comment) |
| Hedera | Consensus Service message on a registry topic | HCS topic |

### 4.2 Storage budgets

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

### 4.3 The chain registry

The chain registry — `packages/utils/src/chains.ts` — is the protocol's
single source of truth: every network entry carries its RPC endpoints,
explorer URL templates, deployed contract/module/program/topic identifiers,
a rollout status (`active`, `planned`, `deprecated`), and its storage
character (`embedsChunkData` marks storage-first networks that embed bytes
by default). A chain is **provisioned** when its entry carries a live
deployment (or needs none); anchoring against an unprovisioned chain fails
fast with a typed error so callers can fall back or choose another network.

## 5. The optimistic anchor protocol

On contract-capable runtimes (EVM, Aptos, Sui, Starknet, NEAR), file-level
anchors are upgraded from timestamps to **verified claims** through a
propose/verify market denominated in the protocol token, FOCAT (§6). Chunk
anchors — including the data-carrying ones — remain free event emissions;
only the file-level CID enters the paid protocol.

### 5.1 Roles

- **Proposer** — anyone anchoring a file. Escrows a FOCAT tip plus a
  refundable bond.
- **Validator** — stakes FOCAT above a governance-set minimum to join the
  active set. Earns the validator share of every verified tip and serves on
  dispute juries. Unbonding is subject to a cooldown that remains slashable.
- **Platform** — a registered integrator (the FileOnChain app itself is
  platform 1; partner apps, APIs, and MCP clients register their own ids).
  Earns the platform share of tips on anchors it originates, capped by a
  governance-set fee ceiling.
- **Challenger** — anyone who believes a proposal is invalid. Posts a
  counter-bond to open a dispute.

### 5.2 Lifecycle

1. **Propose.** `proposeAnchor` escrows the tip + bond and records the CID,
   the storage URI, and the originating platform id.
2. **Challenge window.** For **24 hours** (governance-configurable) anyone
   may challenge with a counter-bond. Most anchors are honest, so most pass
   through untouched — this is the optimistic fast path.
3. **Verify (fast path).** After an unchallenged window, finalization is
   **permissionless** — anyone may call it. The anchor becomes *Verified*
   ("first verified wins" per CID), the proposer's bond returns, and the tip
   splits per §5.3.
4. **Dispute (slow path).** A challenge draws a **five-member jury** at
   random from the staked validator set. Majority decides; ties default to
   the optimistic outcome. The losing side's bond is slashed to the winners,
   and jurors who voted with the losing side are slashed from stake.

Verification settles *per file, per chain*. The same CID — stored once — can
be anchored and independently verified on any number of chains, and the
record on each remains readable by anyone, wallet-free.

### 5.3 Fee split

The tip of every verified anchor splits three ways (basis points set by
governance; defaults shown):

| Share | Recipient | Default |
| --- | --- | --- |
| Validators | Pro-rata across active stake, claimed as pull payments | **60%** |
| Platform | The registered integrator that originated the anchor | **25%** |
| Protocol | The treasury held by the governance timelock | **15%** |

The split aligns the three parties the market needs: validators are paid to
stake and police claims, integrators are paid to bring anchors into the
protocol, and the treasury funds whatever FOCAT holders vote for.

### 5.4 The contract suite

The protocol is a small suite deployed together on every contract runtime
(names vary per runtime; roles do not):

- **FOCAT** (`FileOnChainAttestationToken`) — the protocol token (§6).
- **FileRegistry** — the anchor protocol itself: free chunk events (with or
  without embedded data), paid `proposeAnchor`, the challenge window, jury
  draws, dispute resolution, and pull-payment fee splits.
- **ValidatorStaking** — the active validator set: minimum stake, pro-rata
  tip rewards, slashable unbonding cooldown, and execution of jury slashes.
- **PlatformRegistry** — registered integrators and their fee caps.
- **Governor + Timelock** (EVM only) — parameter changes, treasury spends,
  and upgrades (§7).
- **CachePayments · DonationEscrow** — the retrieval-acceleration services
  (§8), outside the anchor fee split.

## 6. The FOCAT token

FOCAT (FileOnChain Attestation Token) is the unit of account of the
verification market: tips, bonds, validator stakes, and — on EVM —
governance votes. Storage itself is paid in each chain's native fees; FOCAT
prices the *verification* of the file-level claim.

### 6.1 One global supply

FOCAT exists natively on every contract runtime: an ERC-20 with ERC20Votes
on EVM, a Fungible Asset on Aptos, `Coin<FOCAT>` on Sui, a Cairo ERC-20 on
Starknet, and a NEP-141 token on NEAR. The initial supply mints **once, on
the home chain**; every other deployment starts at zero and receives FOCAT
exclusively through bridges, so the global supply stays fixed.

### 6.2 Bridging by governance, not by vendor

Supply moves by **burn on the source chain, mint on the destination**,
through bridges that governance explicitly approves — no bridge vendor is
hard-coded into the token. On EVM the token implements ERC-7802
(`crosschainMint` / `crosschainBurn`) with per-bridge mint/burn rate limits
that replenish linearly over one day: the rate limit is the blast-radius cap
if a bridge is ever compromised. Non-EVM tokens carry admin-managed bridge
allowlists with the same burn/mint pair (per-bridge rate limits are EVM-only
in v1 — a documented gap, see §10).

### 6.3 Acquiring FOCAT

The token is designed to stay out of the way:

- **Most users never touch it.** Signing in and paying with USD credits
  lets FileOnChain's hosted worker hold the FOCAT and anchor on the user's
  behalf. The user sees "verified anchor on Base — $X," not "buy 101
  FOCAT."
- **Wallet anchoring uses fixed-price anchor packs.** Pay-as-you-go
  anchoring escrows the tip and refundable bond from the user's own wallet,
  so the upload flow offers a fixed-price pack — enough FOCAT for one
  propose, paid from credits, delivered to the connected wallet. A
  verification fee, not a trading desk.
- **Validators earn rather than buy.** The 60% tip share plus slashed bonds
  from lost disputes flow to validators continuously; a starter pack
  (minimum stake + one propose) exists purely for bootstrapping.
- **Testnets are faucet-only.** Test networks drip FOCAT for free; the
  faucet and any mainnet distribution are never mixed.

## 7. Governance

### 7.1 The EVM hub

Protocol governance lives on EVM as a standard OpenZeppelin
Governor + Timelock pair:

- **FileOnChainGovernor** — FOCAT (ERC20Votes) holders vote. Deploy-time
  defaults: 1-day voting delay, 1-week voting period, 100,000 FOCAT
  proposal threshold, 4% quorum.
- **FileOnChainTimelock** — 2-day minimum delay. The Governor is its only
  proposer and canceller; execution is open.

The timelock **owns everything**: every parameter setter on FileRegistry,
ValidatorStaking, and PlatformRegistry is owner-only, the timelock *is* the
protocol treasury (the 15% tip share accrues to it, and spending it is a
proposal), and each contract's proxy admin is owned by the timelock. A
parameter change, a treasury spend, and a contract upgrade are all the same
motion: delegate → propose → vote → queue → wait out the timelock →
execute. The deployer renounces its timelock admin role at the end of the
deployment run.

Governance sets **protocol rules, never per-file outcomes**: the fee-split
basis points, platform fee caps and registration, bond sizes, minimum tips,
window durations, jury size and slash amounts, validator stake minimums, and
treasury spends. Whether an individual CID verifies is decided by the
optimistic window and, on dispute, a staked jury — not by token votes.

### 7.2 The non-EVM mirror

Aptos, Sui, Starknet, and NEAR run the same protocol — same lifecycle, same
60/25/15 split, same defaults — but do not port the Governor. Each runtime
keeps its parameters behind an admin (an account, an `AdminCap` object, or
an admin storage slot) that **executes EVM governance decisions**: when a
proposal passes on EVM, the admin replays the equivalent setter on each
non-EVM runtime. Every registry exposes the same setter vocabulary, so
decisions map one-to-one.

This is a trust seam by design in v1: non-EVM parameter changes are only as
trustworthy as the admin's fidelity to EVM outcomes. The admin is a
FileOnChain-operated account today, hardening to a multisig and eventually a
cross-chain message executor as the protocol matures.

### 7.3 Upgradeability

Every EVM protocol contract sits behind an OpenZeppelin transparent
upgradeable proxy whose admin is owned by the timelock — an upgrade is a
governance proposal like any parameter change. The Governor and Timelock
themselves are deliberately **not** proxied: a governor migration is a
proposer-role rotation on the timelock, and the timelock is the root of
trust. The other runtimes upgrade through their native mechanisms (Move
package upgrades, Cairo `replace_class`, NEAR re-deploys), executed by the
same governance-mirroring admin.

## 8. Retrieval and the cache tiers

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

## 9. Access paths

Everything on fileonchain.org runs on the same open-source packages anyone
can use:

- **The webapp** — wallet-signed uploads across all twelve families: pick
  the storage chain (cost and transaction count shown per candidate),
  anchor on the chain of your choice, or opt out and link an existing copy.
  Plus an explorer over anchored CIDs, cache payments, donations, and a
  credits-based dashboard.
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
  can anchor files without holding private keys.

## 10. Security considerations and known limitations

Design choices and their trade-offs, stated plainly:

- **On-chain bytes are public and permanent.** Anything stored unencrypted
  is world-readable forever — that is the point, and also the warning.
  Sensitive content belongs in the encrypted private cache, or encrypted
  client-side before storage.
- **Data durability equals the storage chain's history retention.** On a
  purpose-built storage network (Autonomys) archival is the protocol; on
  general-purpose chains, embedded bytes live in transaction history (e.g.
  EVM calldata), whose long-term availability depends on archive nodes.
  Choosing the storage chain is choosing its retention model.
- **Small-budget chains make storage possible, not economical.** A 1 MB
  file is ~16 transactions on Autonomys and ~2,000 on Hedera. The uploader
  surfaces transaction counts and costs before signing; the suggested
  default avoids the pathological cases.
- **Anchoring proves existence and integrity, not authorship or
  truthfulness.** The verification market adds economic weight to
  well-formedness and attribution of the claim — it does not fact-check
  file contents.
- **Jury randomness is chain-dependent** (v1): native randomness on Aptos
  and Sui; `prevrandao` plus parent blockhash on EVM (sequencer-influenceable
  on most L2s); a two-step block-hash draw on Starknet (the weakest); the
  block producer's `random_seed` on NEAR.
- **Jury votes are public** — no commit-reveal — and non-voting jurors are
  not slashed. **Platform registration is governance-gated** rather than
  permissionless in v1. **Validator stake is not delegatable**, and juries
  are uniform rather than stake-weighted.
- **The non-EVM governance mirror is a trust seam** (§7.2), and bridge rate
  limits are EVM-only in v1 (§6.2).

Each limitation has a documented follow-up path; the contracts target ≥95%
test coverage per runtime.

## 11. Implementation status

FileOnChain ships honestly: **storage and anchoring are real wherever a
chain is provisioned**, and the registry's provisioning flags — not
marketing copy — are the switch. At the time of writing:

- The payload vocabulary (including data-carrying chunks), the per-family
  storage budgets, all twelve family clients with the `includeData` storage
  switch, the contract suites for the five contract runtimes
  (Solidity/Foundry, Move on Aptos and Sui, Cairo, Rust/NEAR), the hosted
  API, and the MCP server are built and open source.
- Per-chain rollout is tracked in the chain registry: each network flips to
  real storage and anchoring when its contracts, modules, topics, or native
  channels are deployed, recorded, and QA'd. Memo-based anchoring on
  mainnets (Cosmos, TRON, Cardano, TON) is enabled deliberately per network
  after testnet QA.
- Surfaces not yet wired to live deployments (registry reads in the
  explorer, cache fulfillment, protocol statistics) run against a clearly
  marked deterministic mock layer whose call signatures match the real
  integrations, so the seams swap without breaking callers.

## 12. Conclusion

FileOnChain puts the file on the chain — and the proof on every chain. One
payload vocabulary carries both bytes and claims across twelve chain
families; a user-chosen storage chain, with a permanent-storage network as
the suggested home, makes the file itself retrievable from public
infrastructure forever; `fileonchain://` pointers let a proof on any chain
lead back to the bytes; and an optimistic propose/verify market, paid in a
token with one global governance-bridged supply, makes the claims worth
trusting. The protocol is deliberately minimal at its core — a JSON
document, a hash, and the bytes themselves — and deliberately honest at its
edges, shipping real storage chain by chain as deployments land.

---

## References

- Protocol source (monorepo): <https://github.com/FileOnchain/fileonchain-org>
- Chain registry (single source of truth): [`packages/utils/src/chains.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/chains.ts)
- Anchor payload vocabulary: [`packages/utils/src/anchor.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/anchor.ts)
- Storage budgets and URIs: [`packages/utils/src/storage.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/storage.ts)
- Contract suites (five runtimes): [`contracts/`](https://github.com/FileOnchain/fileonchain-org/tree/main/contracts)
- Governance specification: [`docs/governance.md`](https://github.com/FileOnchain/fileonchain-org/blob/main/docs/governance.md)
- SDK documentation: <https://fileonchain.org/docs>
- Protocol overview: <https://fileonchain.org/protocol>
- Autonomys (permanent storage network): <https://www.autonomys.xyz/>
- CIDs / content addressing: <https://docs.ipfs.tech/concepts/content-addressing/>
- ERC-7802 (crosschain token interface): <https://eips.ethereum.org/EIPS/eip-7802>
- CIP-20 (Cardano transaction message metadata): <https://cips.cardano.org/cip/CIP-20>
- OpenZeppelin Governor: <https://docs.openzeppelin.com/contracts/governance>

---

*FileOnChain is open source under the MIT license. This document describes
protocol version 1 and will be revised as governance evolves the
parameters it documents; the values shown are deploy-time defaults.*
