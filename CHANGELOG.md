# Changelog

What changed in the FileOnChain Evidence Protocol, the Agent Evidence
Profile, the reference implementations, and the webapp. Newest first.
The `/changelog` page on the website and its RSS feed
(`/changelog/feed.xml`) are generated from this file, so keep the
format regular:

- `## <version or date>` opens a release. A dated heading is
  `## 0.2.0 - 2026-10-01`; a release with no tag yet is just the date,
  `## 2026-09-09`. `## Unreleased` collects what is on `main` and not
  yet deployed.
- `### <area>` groups entries: Protocol, Profile, Verifier, SDK, Cloud,
  Webapp, Contracts, Action.
- One `- ` bullet per change. Reference pull requests as `(#123)`.
  Protocol entries that change canonical bytes must say so and name the
  regenerated fixtures.

## Unreleased

### Webapp

- Homepage gains a trust strip under the hero, a "who is this for"
  block with one scenario each for agent builders, release engineers,
  and archivists, and GitHub social proof in the footer (#245)
- New `/changelog` page fed by this file, with an RSS feed at
  `/changelog/feed.xml` (#245)

## 2026-09-09

### Verifier

- Verification reports carry an evidence summary: subject, signer
  counts (artifact and envelope separately), receipts per system, and
  key status, for the receipt view and the badge (#233)

### Webapp

- `/verify` renders the report as a printable receipt headed by the
  verifier's exact status; the uploader shows the same receipt after a
  real anchor lands (#233)
- Share block under every report: link, status badge SVG at
  `/api/badge`, badge Markdown, and a social card at `/api/og/verify`
  (#229)
- `/verify` loads an envelope from `?url=` or `?envelope=` and ships
  sample envelopes drawn from the conformance fixtures (#228)
- Hero: one slogan for files and agent runs, and a developer quickstart
  with SDK, CLI, and MCP tabs highlighted on the server (#230, #231)
- Stale chain copy removed; every network is described no further than
  its `integrationStatus` (#232)

### Action

- `seal-release` starter GitHub Action: hashes release artifacts into a
  manifest, seals it with `@fileonchain/sdk/evidence`, verifies, attaches
  the envelope to the GitHub Release, and appends the badge. Dogfooded on
  this repository's own releases (#229)

## 2026-09-05

### Webapp

- Anchor cost quotes come from live gas and price reads instead of the
  static table (#199)

## 2026-09-03

### Webapp

- Explorer reads the DB-backed indexer for real: recent anchors, per-CID
  pages, chunk content, and transaction lookups on Sepolia and Auto EVM
  Chronos (#187, #179)
- Hero ticker and stat tiles show indexed anchors only; nothing is
  padded with filler when the indexer is empty (#197, #198)
- Integrations page lists a network as active only when its contract is
  deployed (#190)
- Code samples are syntax-highlighted with Shiki on the server (#189)

## 2026-08-26

### Protocol

- Receipts are bound to the evidence they settle: offline settlement
  checks report `unknown` (structure only), and the online EVM check
  decodes the anchor payload from calldata and requires it to reference
  the envelope's subject or inclusion root
- Canonical JSON rejects `__proto__` keys, `-0`, and unsafe-range
  integers; a wire scanner rejects duplicate JSON keys before parsing
- Merkle trees move to RFC 6962 style leaf and internal-node domain
  separation with lone-node promotion. This changes canonical bytes:
  every conformance fixture in `packages/protocol/fixtures/` was
  regenerated, the spec was updated, and migrated legacy proofs get
  their own `fileonchain-merkle-legacy/v1` adapter

### Verifier

- The envelope digest only reports a strong pass when a valid envelope
  signature covers it; unsigned digests warn about exactly what they do
  not protect against, and reports carry an explicit `attested` flag
- ed25519 verification pinned to strict RFC 8032; key and signature hex
  must be lowercase as documented
- `fileonchain migrate` validates the legacy package before converting

### Webapp

- Uploads resume after a partial anchor instead of starting over (#160)
- One wallet-connect flow across all twelve chain families (#157)
- Security hardening pass over the account backend and API routes (#153)
- Sepolia `FileRegistry` redeployed and recorded in the chain registry
  (#155)
- Single-chunk uploads no longer break on the IPLD blockstore (#162)

## 2026-07-28

### Cloud

- Hosted anchoring fails closed: a job on a chain without a funded
  signer fails with a readiness error and refunds credits (#57)
- Cache and donation reads go through real RPC; the mock layer remains
  only for unprovisioned chains (#59)
- Memo-anchoring mainnet flags for Cosmos, TRON, Cardano, and TON stay
  off until testnet QA (#58)

## 2026-07-24

### Cloud

- FileOnChain Cloud opens to real users: hosted evidence, agent runs,
  hosted verifier page, retention, search, webhooks, and exports behind
  `fok_` API keys (#55, #37, #35)
- Wallet sign-in extended to TON and Hedera verifiers (#48, #50)

### Webapp

- Vitest brought up for the webapp's pure helpers (#42, #43, #51 to #54)

## 2026-07-11

### Protocol

- First release of the FileOnChain Evidence Protocol as a standalone,
  zero-dependency package: envelope types, canonical JSON, SHA-256,
  Merkle inclusion, context-bound artifact and envelope signing
  payloads, envelope digest, tagged adapter receipts, profile and
  adapter registries, validation, and `legacy-evidence-v1` migration.
  Protocol version 1. Conformance fixtures introduced in
  `packages/protocol/fixtures/`

### Profile

- Agent Evidence Profile v1 (`org.fileonchain.agent/v1`): run, model,
  tool-call, approval, and policy claims with `runId` and `agentId`
  required

### Verifier

- Isomorphic deterministic verifier with structured results
  (`valid`, `valid-with-warnings`, `incomplete`, `invalid`), grouped
  checks, artifact and envelope signatures reported separately, and
  unknown adapters or profiles reported as unknown, never failed
- `fileonchain` CLI with `verify` and `migrate` subcommands
  (`fileonchain-verify` stays as an alias)

### SDK

- Anchor-only family clients: no propose step, no token, free beyond gas
- High-level evidence API on `@fileonchain/sdk/evidence`; the MCP server
  gains a fully local `verify_evidence` tool

### Webapp

- Public browser verifier at `/verify`: no account, no wallet
- The whitepaper splits into the protocol spec, the profile, the product
  overview, the integration status ledger, and the ADRs

## 2026-07-10

### Contracts

- Anchor-only `FileRegistry` deployed on Ethereum Sepolia and Auto EVM
  Chronos; registry reads go through the real contract on provisioned
  chains (#31, #32, #33)

## 2026-07-04

### SDK

- The SDK splits into one package per chain family under
  `@fileonchain/sdk-<family>`, re-exported by the `@fileonchain/sdk`
  umbrella (#16)
- Chunked anchor clients with the same progress and receipt shape on
  every family (#11)

### Webapp

- Account system: sign-in, wallets, credits, API keys, BYOK, and
  preferences (#10, #12)
