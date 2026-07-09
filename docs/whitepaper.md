# FileOnChain

## A chain-agnostic protocol for permanent, verifiable file anchoring

**White paper · Version 1.0 · July 2026**

Marc-Aurèle Besner — [fileonchain.org](https://fileonchain.org) —
[github.com/FileOnchain](https://github.com/FileOnchain)

---

## Abstract

FileOnChain is an open protocol for anchoring the existence and integrity of
files on public blockchains. A file is reduced to a content identifier (CID)
— a self-verifying hash of its bytes — and that CID is written into a
transaction on any of twelve chain families, from EVM and Substrate to
Cardano, TON, and Hedera, using one versioned payload vocabulary that any
indexer can read back regardless of chain. On chains with smart-contract
runtimes, anchors graduate from simple timestamps to *verified claims*
through an optimistic verification market: a proposer escrows a token tip
and bond, the claim survives a 24-hour challenge window policed by staked
validators, and the tip is split between the validators who secure the
market, the platform that originated the anchor, and a community-governed
treasury. Storage of the bytes themselves is deliberately decoupled from
anchoring and served by an encrypted paid cache and a donation-funded public
cache. The entire stack — contracts on five runtimes, twelve TypeScript
anchor clients, a hosted API, and an MCP server for AI agents — is open
source under the MIT license.

---

## 1. Motivation

The web forgets. Links rot, platforms shut down, files are silently edited,
and there is rarely a way to prove that a document existed in a particular
form at a particular time. Public blockchains solve exactly this — durable,
timestamped, tamper-evident records — yet using them for files remains
fragmented:

- **Every chain is a silo.** An anchor written on Ethereum is invisible to
  tooling built for Solana; each ecosystem reinvents its own ad-hoc format
  for "this hash existed."
- **Anchors are unverified.** A transaction proves *someone wrote a hash at
  a time* — it says nothing about whether the anchor is well-formed,
  attributable, or worth trusting. There is no economic layer that puts
  skin in the game behind a claim.
- **Storage and proof are conflated.** Fully on-chain storage is
  prohibitively expensive on most networks, while off-chain storage without
  an on-chain commitment proves nothing. The two concerns need a clean
  seam, not a bundle.

FileOnChain addresses all three. It defines **one anchor vocabulary** that
works identically across twelve chain families, adds an **optimistic
verification protocol** that turns anchors into economically backed claims
on contract-capable chains, and keeps **byte storage separate** — content
addressing makes the bytes reconstructible and verifiable from any host, so
no canonical host needs to exist.

## 2. Design principles

1. **Content addressing over location addressing.** Files are identified by
   CIDv1 hashes. A CID is valid forever and verifiable by anyone holding the
   bytes; the anchor commits to *what* the file is, never *where* it lives.
2. **Chain-agnostic by construction.** The payload written on-chain is
   byte-identical on every family. Chains differ only in the transaction
   envelope — a contract call, a remark, a memo, transaction metadata, or a
   consensus message.
3. **Meet each chain where it is.** Contract runtimes get the full
   verification protocol; memo-capable chains get lightweight anchoring
   through native channels with no deployment required. A chain's
   capabilities decide its transport, not the other way around.
4. **Optimistic verification.** Most anchors are honest, so the fast path is
   cheap: propose, wait out a challenge window, finalize. Disputes are the
   expensive exception, resolved by juries drawn from staked validators.
5. **Storage is a market, not a promise.** Anchoring proves; caching serves.
   Private caching is paid and end-to-end encrypted; public caching is
   donation-funded. Neither is required for an anchor to remain valid.
6. **Open everything.** Contracts, SDKs, the webapp, the API surface, and
   this document are MIT-licensed and developed in the open.

## 3. System overview

### 3.1 Content addressing and chunking

A file (or folder — a folder anchors exactly like a file, via the CID of its
DAG root) is processed client-side:

1. The bytes are split into **64 KiB chunks**.
2. Each chunk is hashed with SHA-256 and encoded as a **CIDv1**.
3. Chunk CIDs are linked into a forward-chained sequence — each chunk anchor
   names the CID of the next — and the file itself is identified by its root
   CID.

Hashing happens in the browser or the caller's own process; the raw bytes
never need to leave the uploader's machine for an anchor to be created.

### 3.2 The anchor payload

Every anchor, on every chain, is the same versioned JSON document,
identified by the protocol tag `p: "fileonchain"` and version `v: 1`.

**File-level anchor** — one per file (or folder DAG root):

| Field | Type | Meaning |
| --- | --- | --- |
| `p` | `"fileonchain"` | Protocol tag |
| `v` | `1` | Payload version |
| `op` | `"anchor"` | Operation |
| `cid` | string | CIDv1 of the file or folder DAG root |
| `sha256` | string, optional | SHA-256 (hex) of the raw content |
| `uri` | string, optional | IPFS / Arweave pointer |
| `pid` | string, optional | Originating platform id (integrator attribution) |

**Chunk-level anchor** — one per 64 KiB chunk:

| Field | Type | Meaning |
| --- | --- | --- |
| `p` / `v` | as above | Protocol tag and version |
| `op` | `"chunk"` | Operation |
| `cid` | string | CIDv1 of this chunk |
| `fileCid` | string | CIDv1 of the whole file |
| `idx` | number | Zero-based chunk index |
| `total` | number | Total chunks in the file |
| `next` | string, optional | CIDv1 of the next chunk (omitted on the last) |
| `d` | string, optional | Base64 chunk bytes — only on data-carrying chains |

Two properties follow from this design:

- **One indexer reads every chain.** `parseAnchorPayload` decodes an anchor
  whether it was found in an EVM event, a Substrate remark, a Solana memo,
  Cardano transaction metadata, or a Hedera consensus message.
- **Attribution travels with the payload.** The `pid` field carries the
  originating platform on every family — including memo-only chains with no
  contract to enforce it — so integrator attribution survives everywhere.

### 3.3 Anchoring order

Chunk anchors are always written **first**, and the file-level anchor
**last**. Indexers rely on this ordering: when a file-level anchor appears,
its chunk trail is already complete, so the file record can be finalized in
a single pass.

## 4. Chain families and transports

FileOnChain v1 spans **twelve chain families** — at the time of writing, 55
registered networks (28 mainnets and 27 testnets). Each family anchors
through the most native channel its runtime offers:

| Family | Transport | Deployment required |
| --- | --- | --- |
| EVM | `FileRegistry` contract call per chunk + file; paid `proposeAnchor` for verification | Contract suite |
| Substrate | `system.remarkWithEvent`, batched via `utility.batchAll`; chunk bytes embedded where supported (Autonomys) | None (native remarks) |
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

The chain registry — `packages/utils/src/chains.ts` — is the protocol's
single source of truth: every network entry carries its RPC endpoints,
explorer URL templates, deployed contract/module/program/topic identifiers,
and a rollout status (`active`, `planned`, or `deprecated`). A chain is
**provisioned** when its entry carries a live deployment (or needs none);
anchoring against an unprovisioned chain fails fast with a typed error so
callers can fall back or choose another network.

Sui and Starknet batch all of a file's anchors into a single programmable
transaction block or multicall — one signature for the whole file. The
memo/metadata/comment families (Cosmos, TRON, Cardano, TON) send one payload
per transaction with pre-flight size validation against each network's
limits. Hedera writes each payload as a message to a Consensus Service
topic.

## 5. The optimistic anchor protocol

On contract-capable runtimes (EVM, Aptos, Sui, Starknet, NEAR), file-level
anchors are upgraded from timestamps to **verified claims** through a
propose/verify market denominated in the protocol token, FOCAT
(§6). Chunk anchors remain free event emissions — only the file-level CID
enters the protocol.

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
   the URI, and the originating platform id.
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

Verification settles *per file, per chain*. The same CID can be anchored —
and independently verified — on any number of chains, and the record on
each remains readable by anyone, wallet-free.

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
- **FileRegistry** — the anchor protocol itself: free chunk events, paid
  `proposeAnchor`, the challenge window, jury draws, dispute resolution,
  and pull-payment fee splits.
- **ValidatorStaking** — the active validator set: minimum stake, pro-rata
  tip rewards, slashable unbonding cooldown, and execution of jury slashes.
- **PlatformRegistry** — registered integrators and their fee caps.
- **Governor + Timelock** (EVM only) — parameter changes, treasury spends,
  and upgrades (§7).
- **CachePayments · DonationEscrow** — adjacent storage services (§8),
  outside the anchor fee split.

## 6. The FOCAT token

FOCAT (FileOnChain Attestation Token) is the unit of account of the
verification market: tips, bonds, validator stakes, and — on EVM —
governance votes.

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

## 8. Storage: anchoring proves, caching serves

An anchor commits to a file's content; it does not store the bytes (except
on data-carrying chains such as Autonomys, where chunk bytes ride along in
the anchor itself). Because CIDs are content-addressed, the bytes can be
rebuilt and verified from *any* host — so FileOnChain treats availability as
a market with two tiers rather than a promise:

- **Private cache (paid).** Chunks are encrypted client-side with a key
  only the uploader (and their sharees) hold; cache nodes store ciphertext
  for the duration paid, and never see plaintext. Payments settle in USDC
  through the `CachePayments` contract.
- **Public cache (donation-funded).** A free, slow-tier pin for public
  goods — research data, archives, open-source releases. Donations in the
  chain's native coin route through the `DonationEscrow` contract to cache
  node operators.

Neither tier is required for an anchor's validity, and no canonical host
exists: anyone holding bytes that hash to the anchored CID holds the file.

## 9. Access paths

Everything on fileonchain.org runs on the same open-source packages anyone
can use:

- **The webapp** — wallet-signed, pay-as-you-go anchoring across all twelve
  families, an explorer over anchored CIDs, cache payments, donations, and
  a credits-based dashboard.
- **`@fileonchain/sdk`** — the umbrella TypeScript SDK: the chain registry
  and payload vocabulary at the root, one anchor client per family behind
  subpaths (`/evm`, `/substrate`, … `/hedera`). Every family exposes the
  same `anchorChunkedFile` with identical progress and receipt shapes. Nine
  of the twelve clients are fully dependency-free — a minimal structural
  signer interface owns transport, so injected wallets or server keys adapt
  in a few lines; only EVM, Substrate, and Solana have (optional) peer
  dependencies.
- **`@fileonchain/api`** — a zero-dependency client for the hosted API:
  FileOnChain's workers sign and send, paid with account credits under
  `fok_` API keys. On-chain failures refund credits.
- **`@fileonchain/mcp`** — a Model Context Protocol server exposing registry
  lookups, CID validation, and API-backed anchoring as tools, so AI agents
  can anchor files without holding private keys.

## 10. Security considerations and known limitations

Design choices and their trade-offs, stated plainly:

- **Anchoring proves existence and integrity, not authorship or
  truthfulness.** An anchor demonstrates that whoever sent the transaction
  possessed the content (or its hash) at that time. The verification market
  adds economic weight to *well-formedness and attribution* of the claim —
  it does not fact-check file contents.
- **Jury randomness is chain-dependent** (v1): native randomness on Aptos
  and Sui; `prevrandao` plus parent blockhash on EVM (sequencer-influenceable
  on most L2s); a two-step block-hash draw on Starknet (the weakest); the
  block producer's `random_seed` on NEAR.
- **Jury votes are public** — no commit-reveal — and non-voting jurors are
  not slashed.
- **Platform registration is governance-gated** rather than permissionless
  in v1.
- **Validator stake is not delegatable**, and juries are uniform rather than
  stake-weighted.
- **The non-EVM governance mirror is a trust seam** (§7.2), and bridge rate
  limits are EVM-only in v1 (§6.2).
- **Cache nodes are availability, not custody.** Private-cache nodes hold
  ciphertext only; losing the client-held key means losing access, by
  design.

Each limitation has a documented follow-up path; the contracts target ≥95%
test coverage per runtime.

## 11. Implementation status

FileOnChain ships honestly: **anchoring is real wherever a chain is
provisioned**, and the registry's provisioning flags — not marketing copy —
are the switch. At the time of writing:

- The anchor payload vocabulary, all twelve family clients, the contract
  suites for the five contract runtimes (Solidity/Foundry, Move on Aptos
  and Sui, Cairo, Rust/NEAR), the hosted API, and the MCP server are built
  and open source.
- Per-chain rollout is tracked in the chain registry: each network flips to
  real anchoring when its contracts, modules, topics, or native channels
  are deployed, recorded, and QA'd. Memo-based anchoring on mainnets
  (Cosmos, TRON, Cardano, TON) is enabled deliberately per network after
  testnet QA.
- Surfaces not yet wired to live deployments (registry reads in the
  explorer, cache fulfillment, protocol statistics) run against a clearly
  marked deterministic mock layer whose call signatures match the real
  integrations, so the seams swap without breaking callers.

## 12. Conclusion

FileOnChain turns "this file existed" into a portable, verifiable,
economically backed on-chain fact. One payload vocabulary makes anchors
readable across twelve chain families; an optimistic propose/verify market
makes them trustworthy on contract-capable chains; a token with one global,
governance-bridged supply pays the validators, platforms, and treasury that
keep the market honest; and content addressing keeps storage a competitive
service rather than a point of failure. The protocol is deliberately
minimal at its core — a JSON document and a hash — and deliberately honest
at its edges, shipping real anchoring chain by chain as deployments land.

---

## References

- Protocol source (monorepo): <https://github.com/FileOnchain/fileonchain-org>
- Chain registry (single source of truth): [`packages/utils/src/chains.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/chains.ts)
- Anchor payload vocabulary: [`packages/utils/src/anchor.ts`](https://github.com/FileOnchain/fileonchain-org/blob/main/packages/utils/src/anchor.ts)
- Contract suites (five runtimes): [`contracts/`](https://github.com/FileOnchain/fileonchain-org/tree/main/contracts)
- Governance specification: [`docs/governance.md`](https://github.com/FileOnchain/fileonchain-org/blob/main/docs/governance.md)
- SDK documentation: <https://fileonchain.org/docs>
- Protocol overview: <https://fileonchain.org/protocol>
- CIDs / content addressing: <https://docs.ipfs.tech/concepts/content-addressing/>
- ERC-7802 (crosschain token interface): <https://eips.ethereum.org/EIPS/eip-7802>
- CIP-20 (Cardano transaction message metadata): <https://cips.cardano.org/cip/CIP-20>
- OpenZeppelin Governor: <https://docs.openzeppelin.com/contracts/governance>

---

*FileOnChain is open source under the MIT license. This document describes
protocol version 1 and will be revised as governance evolves the
parameters it documents; the values shown are deploy-time defaults.*
