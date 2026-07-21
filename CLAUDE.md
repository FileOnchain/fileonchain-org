# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep it current when
architecture or conventions change.

## What this is

FileOnChain — portable, independently verifiable evidence — organized as
**four named layers** (never blur them):

1. **FileOnChain Evidence Protocol** — the neutral, application-independent
   spec (`docs/protocol/evidence-protocol.md`, implemented in
   `packages/protocol`). Assumes nothing about files, AI, or chains.
2. **Agent Evidence Profile** — the first official application profile
   (`docs/profiles/agent-evidence-v1.md`, `packages/agent-profile`):
   opinionated AI-agent claims under `org.fileonchain.agent`.
3. **FileOnChain Cloud** — the hosted commercial product
   (`docs/product/fileonchain-cloud.md`): hosted API, MCP server,
   dashboard, billing. Cloud-only concerns never leak into the protocol.
4. **Reference implementations** — the SDKs, verifier, CLI, adapters, and
   webapp. They must not define undocumented protocol behavior.

Guiding rule: *the protocol is neutral, the application profile is
opinionated, the hosted product is convenient.*

The pnpm workspace monorepo:

- **`apps/web`** — Next.js webapp: agent-evidence marketing + creation
  flow, the public `/verify` page (no account, no wallet), an explorer,
  private-cache payments, donations, and a credits dashboard.
- **`packages/`** — the publishable `@fileonchain/*` packages:
  - `protocol/` — `@fileonchain/protocol`, the standalone (zero-dep)
    Evidence Protocol core: envelope types, canonical JSON, sha256,
    Merkle, artifact/envelope signing payloads (context-bound: protocol id
    + version + profile + purpose + scope), envelope digest (canonical
    envelope minus the `envelope` member), tagged adapter receipts,
    profile/adapter registries, validation, and `legacy-evidence-v1`
    migration. Conformance fixtures live in `packages/protocol/fixtures/`.
    MUST NOT import MCP/API/DB/wallet/framework code.
  - `agent-profile/` — `@fileonchain/agent-profile`, the Agent Evidence
    Profile (`org.fileonchain.agent/v1`): run/model/tool-call/approval/
    policy claims, validation (runId + agentId required), and
    `buildAgentEvidence`. Registers itself with the protocol on import.
  - `verify/` — `@fileonchain/verify`, the deterministic local verifier:
    **isomorphic** core (EIP-191 via viem, ed25519 via @noble/curves — no
    node:crypto; the webapp uses it client-side) + the `fileonchain` CLI
    (`verify` / `migrate` subcommands; `fileonchain-verify` is an alias).
    Structured results: `valid | valid-with-warnings | incomplete |
    invalid`, grouped checks, artifact vs envelope signatures reported
    separately, unknown adapters/profiles reported *unknown* never failed.
    The most important product component — treat its correctness
    accordingly.
  - `utils/` — `@fileonchain/utils`, the dependency-free chain core:
    network registry with honest `integrationStatus`, CID validation, the
    anchor payload vocabulary, storage budgets, orchestration helpers —
    plus the **legacy** `evidence.ts`/`manifest.ts` (the pre-separation
    `legacy-evidence-v1` format; kept verifiable + migratable, do not
    extend it — new work targets `packages/protocol`).
  - `sdk-<family>/` ×12 — `@fileonchain/sdk-evm` … `sdk-hedera`, one anchor
    client per chain family. `sdk-evm` also owns the generated ABIs.
  - `api/` — `@fileonchain/api`, typed client for the FileOnChain Cloud
    HTTP API (`/api/v1/*`, `fok_` key auth).
  - `sdk/` — `@fileonchain/sdk`, the **reference SDK** umbrella: root =
    utils + EVM ABIs, `./<family>` subpaths for the anchor clients,
    `./api` for the Cloud client, and the evidence surface —
    `./protocol`, `./agent-profile`, and `./evidence` (high-level
    `createEvidence` / `sealAgentRun` / `signEnvelope` /
    `settlementReceiptFromAnchor`). The webapp depends only on this.
  - `mcp/` — `@fileonchain/mcp`, stdio MCP server — a **Cloud + SDK
    integration, not part of the protocol**: local registry/verify tools
    (including `verify_evidence`, fully in-process) + Cloud-backed
    anchoring tools behind `FILEONCHAIN_API_KEY`.
- **`contracts/`** — one directory per runtime (`evm/` Foundry, `aptos/` +
  `sui/` Move, `starknet/` Cairo, `near/` Rust) — see `contracts/README.md`.
  All five are **anchor-only**: free event-carrier writes for the versioned
  payloads (chunk, file, manifest), plus a first-write CID record on EVM.
  No token, no economics, no governance.

**There is no FOCAT token, staking, jury, bridge, or token governance
anywhere in v1** — not in contracts, SDKs, API, DB, or UI. An earlier
verification-market experiment is preserved, unmaintained, on the branch
`archive/focat-verification-market`; never reintroduce its concepts into
active code or copy. Hosted services charge account credits/USDC; anchoring
costs each chain's gas.

**Anchoring is real where a chain is provisioned; everything else is mock.**
The pay-as-you-go upload flow sends real transactions through
`apps/web/src/lib/anchor/*` (per-family `@fileonchain/sdk` clients) and falls
back to `apps/web/src/lib/mock/*` only when a chain has nothing deployed
(`ChainNotProvisionedError`). Registry reads, cache, donations, and the
indexer still resolve through the mock layer — see "Mock layer" below.

**Storage is opt-in, not the default.** Uploads default to evidence-only
(hash + signatures + settlement receipts; bytes never leave the client).
Users may opt into on-chain storage — chunks sized by `getChunkDataBudget`,
bytes embedded via `includeData`, Autonomys suggested — or link an external
URI. Vocabulary in `packages/utils/src/storage.ts`; `useFileUploader` +
`components/upload/StorageSelector.tsx`; design in `docs/whitepaper.md`.

## Commands

Run from the repo root:

```bash
pnpm dev            # webapp dev server on http://localhost:3000
pnpm build          # builds SDK then webapp (tsc + lint; the real gate)
pnpm lint           # SDK typecheck + webapp ESLint
pnpm start          # serve the webapp production build
pnpm clean          # remove build outputs
```

Or scope to one package: `pnpm --filter @fileonchain/utils build`,
`pnpm --filter "@fileonchain/sdk-*" lint`, `pnpm --filter @fileonchain/web dev`.

Database (Neon Postgres via Drizzle, from `apps/web`):

```bash
pnpm --filter @fileonchain/web db:generate   # regenerate migrations after editing schema.ts
pnpm --filter @fileonchain/web db:push       # push schema to $DATABASE_URL (dev)
pnpm --filter @fileonchain/web db:migrate    # apply committed migrations
pnpm --filter @fileonchain/web db:studio     # browse data
```

There is no unit-test runner for the webapp. **Verify changes with
`pnpm build`** — it typechecks and lints everything and catches
server/client boundary errors that `tsc` alone misses.

The protocol layer DOES have tests (vitest) and conformance fixtures —
run them whenever touching `packages/protocol`, `packages/agent-profile`,
or `packages/verify`:

```bash
pnpm --filter @fileonchain/protocol test
pnpm --filter @fileonchain/verify test     # includes the fixture conformance run
# Regenerate fixtures ONLY on intentional protocol changes (they are
# deterministic; a diff means the protocol's bytes changed):
cd packages/verify && node scripts/generate-fixtures.mjs
```

Contracts (only when touching them):

```bash
cd contracts/evm && forge build && forge test        # Solidity
cd contracts/near && cargo test -p fileonchain-registry
cd contracts/starknet && scarb build
cd contracts/aptos && aptos move test
cd contracts/sui && sui move test
```

After changing an EVM contract, regenerate the SDK ABIs:
`cd contracts/evm && forge build`, then
`node ../../packages/sdk-evm/scripts/extract-abis.mjs` (run from
`contracts/evm`).

## Package manager & runtime

pnpm **>= 10** (pinned via `packageManager: pnpm@10.28.1` in the root
manifest) and Node **>= 20**. Use pnpm, not npm/yarn/bun. The root
`package.json` carries workspace-wide `pnpm.overrides` /
`onlyBuiltDependencies`; the `@polkadot/*` overrides pin transitive versions
to keep the API surface consistent — don't remove them casually (see Gotchas).

## Architecture

### The SDK packages — source of truth (`packages/`)

`@fileonchain/utils` (`packages/utils`) is the shared, dependency-free core:

- `src/chains.ts` — `ChainConfig` registry. `CHAINS` is a
  `readonly ChainConfig[]`; look up with `getChain(id)` /
  `getChainsByFamily(family)`; `DEFAULT_CHAIN_ID` is
  `substrate:autonomys-mainnet` (the v1 primary permanent-storage system).
  Every entry carries a rollout `status` — `"active"` (open for uploads),
  `"planned"` (roadmap adapter; not selectable, anchoring API rejects it),
  `"deprecated"` (reads only) — gated via `isChainActive` / `ACTIVE_CHAINS`
  — **and** an honest `integrationStatus`
  (`designed → implemented → tested-locally → testnet-deployed →
  mainnet-deployed → webapp-integrated → production-ready → audited`;
  absent = `"implemented"`). **Never describe a network beyond its
  integrationStatus in product copy.** The v1 launch set: Autonomys
  mainnet + Taurus (native remarks, webapp-integrated), Solana mainnet +
  devnet (native SPL Memo, webapp-integrated), EVM Sepolia + Auto EVM
  Chronos (anchor-only FileRegistry, testnet-deployed). Contract addresses
  live **on the chain entries** (`registryContract`, `cacheContract`,
  `donationContract`, `usdcContract`, `programId`, `moduleAddress`,
  `palletContract`) — no separate address maps. Family-specific fields:
  `memoAnchoring` (Cosmos, TRON, Cardano, TON), `bech32Prefix` (Cosmos),
  `hcsTopicId` (Hedera), `embedsChunkData` (Autonomys). Explorer URLs via
  `buildTxUrl` / `buildAddressUrl`; `MAINNET_CHAINS` / `TESTNET_CHAINS` /
  `getVisibleChains(showTestnets)` split testnets; webapp pickers use
  `useVisibleChains()`. **To add or change a chain or a deployed address,
  edit `chains.ts` — never hardcode chain data in webapp components** (see
  `docs/chains/checklist.md`).
- `src/evidence.ts` + `src/manifest.ts` — **legacy-evidence-v1**, the
  pre-separation evidence format (`p: "fileonchain-evidence", v: 1`).
  Frozen: kept so old packages stay verifiable (`verifyLegacyPackage` in
  @fileonchain/verify) and migratable (`migrateLegacyEvidence` in
  @fileonchain/protocol, `fileonchain migrate` CLI). Do not extend —
  new evidence work targets `packages/protocol`.
- `src/sha256.ts` — dependency-free synchronous SHA-256 + hex helpers
  (browser/Node/edge identical; `packages/protocol` carries its own copy
  so the protocol package stays standalone).
- `src/types.ts` — `ChainFamily`, `ChainId` (template-literal
  `` `${ChainFamily}:${string}` ``), `CIDRegistryRecord`.
- `src/anchor.ts` — the chain-agnostic anchoring vocabulary: versioned JSON
  payloads (`buildFileAnchorPayload` / `buildChunkAnchorPayload` /
  `parseAnchorPayload`) written identically on every family, the
  `AnchorChunk` / `ChunkedAnchorReceipt` / `AnchorProgress` types, and the
  provisioning seam (`isChainProvisioned`, `ChainNotProvisionedError`).
  The `pid` field is pure integrator attribution — it confers no fees.
- `src/storage.ts` — per-family payload budgets
  (`FAMILY_PAYLOAD_BUDGET_BYTES`), `getChunkDataBudget` / `isStorageCapable`
  / `storageChunkCount`, and the `fileonchain://<chainId>/<cid>` storage URI
  (`buildStorageUri` / `parseStorageUri`).
- `src/helpers.ts` — orchestration shared by family clients:
  `resolveFamilyChain`, `assertPayloadFits`, `batchByBytes` /
  `batchByCount`, `buildChunkedAnchorPayloads` (chunks first, file anchor
  **last** — indexers rely on that ordering), `runSequentialChunkedAnchor`.

`@fileonchain/verify` (`packages/verify`) — the deterministic local
verifier: `verifyEvidenceJson` (format auto-detect) / `verifyEnvelope` /
`verifyLegacyPackage` return a `VerificationReport` — overall status
`valid | valid-with-warnings | incomplete | invalid`, grouped checks
(`pass`/`fail`/`warning`/`unknown`/`skipped`) covering subject integrity,
artifact signatures, claimed identities/delegations, envelope digest +
envelope signatures, receipts per kind via the adapter registry, and key
status. CLI: `fileonchain verify <file> [--artifact <bytes>] [--online]
[--json]` and `fileonchain migrate <legacy> [-o out]`
(`fileonchain-verify` is a compatible alias). Isomorphic — ed25519 via
@noble/curves, EIP-191 via viem, no node:crypto — so the webapp's /verify
page runs the same core in the browser. tsup bundles the workspace deps
(`noExternal`) so the CLI bins run standalone.

Family clients, one package each (`packages/sdk-<family>`, all twelve), all
exposing `anchorChunkedFile` with the same progress/receipt shape plus a
file-level `anchorCID` for the server worker. All anchors are **free beyond
gas** — the registry is an event carrier; the payload `op` distinguishes
chunk, file, and manifest anchors. `sdk-evm` (peer viem) owns `src/abis/*`
(generated — don't hand-edit; only `fileRegistryAbi`, `cachePaymentsAbi`,
`donationEscrowAbi` exist) on a viem-free `./abis` subpath; its file-level
`anchorCID` writes through the `anchorChunk` event entrypoint (works on
every deployed registry generation), while `getCIDRecord` / `isCIDAnchored`
read the first-write record on anchor-only deployments. `sdk-substrate`
(peer @polkadot/api) — `utility.batchAll` of `system.remarkWithEvent`,
chunk bytes riding along where `embedsChunkData` is set (Autonomys).
`sdk-solana` (peer @solana/web3.js) — SPL Memo. The other nine are
**dependency-free**: the SDK owns payload building, ordering, batching,
size validation, and progress; a minimal structural signer interface owns
transport. Sui and Starknet batch anchors into one PTB/multicall;
memo/metadata/comment families send one payload per transaction with
pre-flight size checks. Peer deps are **optional**.

`@fileonchain/api` (`packages/api`) — `FileOnChainClient` wrapping the
hosted `/api/v1/*` endpoints (anchor, job polling, credits) with `fok_` key
auth; zero runtime deps. `@fileonchain/mcp` (`packages/mcp`) — stdio MCP
server: read-only registry tools + API-backed anchoring tools (env
`FILEONCHAIN_API_KEY` / `FILEONCHAIN_API_URL`); its dist bundles the
workspace deps so `node packages/mcp/dist/index.js` runs from the repo.

`@fileonchain/sdk` (`packages/sdk`) is the reference-SDK umbrella the
webapp consumes: root entry = utils + the EVM ABIs (legacy vocabulary —
kept for compatibility), `./<family>` subpaths re-export the family
packages, `./api` the Cloud client, `./protocol` and `./agent-profile`
the evidence layers, and `./evidence` the high-level DX
(`createEvidence`, `sealAgentRun`, `signEnvelope`, `subjectFromBytes`,
`settlementReceiptFromAnchor`, `storageReceipt` — protocol/profile names
stay behind subpaths so they never collide with the root's legacy
exports). Wiring conventions
shared by all packages: tsconfig extends `packages/tsconfig.base.json`;
`exports` point at `src/*.ts` for the workspace — so **every package the
umbrella re-exports must be listed in the webapp's `transpilePackages`**
(`apps/web/next.config.ts`); `publishConfig.exports` point at `dist/`
(tsup); internal deps are `workspace:^` so publishing rewrites them to real
semver ranges. Repo-level Claude Code skills live in `.claude/skills/`
(`fileonchain-anchor`, `fileonchain-chains`, `fileonchain-packages`).

### The webapp (`apps/web`)

- **`@/*` path alias** → `apps/web/src/*`. Shared chain types/metadata import
  from `@fileonchain/sdk`; only web-specific code uses `@/...`.
- **`src/app/`** — App Router. Routes: `/` (agent-evidence homepage +
  creation flow), `/agent-evidence` (product page), `/verify` (public
  browser verifier — no account, no wallet), `/integrations` (honest
  statuses), `/protocol` (envelope + layers explainer), `/whitepaper`
  (documents index), `/explorer` (+ `/explorer/[cid]`), `/cache`,
  `/donations`, `/leaderboard` (uploaders only),
  `/profile/[address]`, `/login`, and the auth-guarded `/dashboard`
  (+ `logs`, `credits`, `keys`, `byok`, `preferences` subroutes). API routes
  under `app/api/`: the mock trio (`cid`, `search-file`, `upload-fallback`)
  plus the account backend (`auth`, `wallets`, `credits`, `keys`, `byok`,
  `uploads`, `preferences`, `organizations`), the auth-optional
  `recommendations/upload` (Upload Advisor), and the API-key-scoped `v1/`
  namespace (`v1/anchor`, `v1/credits`).
- **`src/components/`** — `ui/` primitives (Button, Modal, Card, …), `layout/`
  (Nav, Footer, PageShell), and feature folders (`explorer/`, `cache/`,
  `donations/`, `chain/`, `upload/`, `onboarding/`, `registry/`). Bare files in
  `components/` are page sections (Hero, HowItWorks, …).
- **`src/hooks/`** — one wallet hook per family (`use<Family>Wallet` for all
  twelve; injected providers, SSR-safe, chain SDKs dynamic-imported) plus
  `useWallet`, `useChain`, `useFileUploader`, `useWalletProof`,
  `useCachePayment`, `useDonation`. `useHederaWallet` is an honest seam —
  HashConnect pairing is a follow-up.
- **`src/states/`** — Zustand stores, exported as `use<Name>States`
  (`useWalletStates`, `useChainsStates`, `useThemeStates`, `useCacheStates`,
  `useDonationsStates`, `usePreferencesStates` — localStorage-persisted,
  hydrated post-mount, synced from the server row by the preferences page).
- **`src/lib/`** — `anchor/` (real pay-as-you-go sends: one sender per
  family wrapping the SDK clients, dispatched by `anchorFileOnChain`; wallet
  handles come from `useWalletStates.getState()`, heavy chain deps are
  dynamic-imported), `cid/format.ts`, `crypto/` (AES-GCM stub), `mock/`
  (see below), `site.ts` / `analytics.ts` / `faq.ts` (SEO),
  `recommendations/` (Upload Advisor: `engine.ts` is a pure, isomorphic
  rule engine; `llm.ts` — server-only, OpenRouter via `OPENROUTER_API_KEY` —
  only polishes headline/rationale copy, never the suggested settings; UI is
  `components/upload/UploadAdvisor.tsx`, gated by
  `NEXT_PUBLIC_UPLOAD_ADVISOR_ENABLED` and the per-user preference).
- **`src/types/types.ts`** — web-only types (`Account`). `ChainFamily`,
  `ChainId`, `CIDRegistryRecord` come from `@fileonchain/sdk`.

### Mock layer

`apps/web/src/lib/mock/*` returns deterministic fake data and is the seam for
real integration. Each file carries a `/* TODO: wire to … */` marker naming
the real call to make (`registry.ts` → contract reads; `cache.ts`,
`donations.ts` → their contracts). `upload.ts` survives only as the fallback
`useFileUploader` uses when `lib/anchor` throws `ChainNotProvisionedError`.

`cid-indexer.ts` is the exception: the underlying data is real now (the
DB-backed indexer at `lib/indexer/queries.ts`, fed by the
`/api/cron/indexer-scan` cron on Sepolia + Auto EVM Chronos). The mock
path stays as a thin re-export file so consumers don't need to change
their import paths. When implementing real behavior for any other mock,
replace the mock body and keep the exported signature stable so callers
don't change.

### Account backend (auth, DB, credits, API keys, BYOK)

The account system is **real** (NextAuth v5 + Neon Postgres + Drizzle) while
chain-side operations behind it stay mock:

- **DB** — schema in `src/lib/db/schema.ts`; client in `src/lib/db/index.ts`
  (Neon **WebSocket** driver — credit debits need interactive transactions;
  created lazily so builds pass without `DATABASE_URL`). Migrations live in
  `apps/web/drizzle/` (`db:generate` after schema edits). Money is bigint
  micro-USDC. Server-only env access goes through `src/lib/env.ts`.
- **Auth** — `src/lib/auth/` (`config.ts`, `index.ts` exporting
  `auth`/`requireUser`). JWT sessions. Google/GitHub providers register only
  when their env creds are set; the `"wallet"` Credentials provider accepts a
  nonce-bound sign-message proof verified per family in `verify-wallet.ts`
  (Tier 2 verifiers under `lib/auth/verifiers/`). `WALLET_FAMILIES` in
  `wallet-message.ts` is the auth-capable list — TON and Hedera anchor but
  can't sign in yet. Client proof collection is `hooks/useWalletProof.ts`.
  Guards: `app/dashboard/layout.tsx` server layout redirect + `requireUser()`
  in routes — **no Edge middleware** (Neon driver is Node-only).
- **Services** — `src/lib/server/*`: `credits.ts` (ledger, advisory-lock
  debits), `api-keys.ts` (hashed `fok_` keys), `anchor-service.ts` +
  `anchor-worker.ts` (server-side anchoring shared by `/api/uploads` and
  `/api/v1/anchor` — anchors the file CID for real through the SDK clients
  when the chain is provisioned AND its `ANCHOR_*` signer env vars are set;
  otherwise falls back to the deterministic mock; on a real send failure the
  job is marked failed and credits are refunded), `byok.ts` +
  `lib/byok/providers.ts`, `activity.ts` (`logActivity`), `queries.ts`,
  `preferences.ts` (shared vocabulary in the client-safe
  `src/lib/preferences.ts`), `organizations.ts` (throws
  `OrgError(status, message)`).
- **Mock seams to make real later**: deposit confirmation
  (`api/credits/deposit/[id]/confirm` — replace with a USDC Transfer
  watcher), `byok.ts` validation (real Auto Drive call), and the per-chain
  deployments themselves — real sends wait on deployments recorded in
  `chains.ts` (see `docs/deploy/`) plus funded `ANCHOR_*` signers. Mainnet
  memo-anchoring flags (Cosmos/TRON/Cardano/TON) flip on after testnet QA.
- Env vars are documented in `apps/web/.env.example`; all are optional for
  `pnpm build`, but runtime account features need `DATABASE_URL` +
  `AUTH_SECRET` (and `BYOK_ENCRYPTION_KEY` for BYOK).

### SEO & analytics

`src/lib/site.ts` holds `siteConfig` (name, canonical `url`, shared
descriptions) and `gaId`, both env-driven (`NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_GA_ID`). The root `layout.tsx` sets `metadataBase`, a title
`template`, default OG/Twitter tags, `robots`, Organization + WebSite
JSON-LD, and mounts GA4 via `components/AnalyticsGate.tsx` **only when
`gaId` is set AND the user's analytics-cookies preference allows it**.
Custom events fire through `trackEvent(name, params)` in
`src/lib/analytics.ts` — add new events to the `AnalyticsEvents` map (GA4
snake_case names, flat scalar params, no PII) rather than calling
`sendGAEvent` directly. The home FAQ emits `FAQPage` JSON-LD from
`src/lib/faq.ts` (single source shared with `FaqAccordion`). Social image:
`src/app/opengraph-image.tsx` via `next/og`. Per-page metadata: server
pages export `metadata`/`generateMetadata`; client pages carry a sibling
`layout.tsx`. Each page sets its own `alternates.canonical`; `/dashboard`
is `robots: { index: false }`. Prefer editing `siteConfig` over hardcoding
URLs or titles.

## Language & claims policy

Terminology is part of the protocol's honesty. The standardized terms:

| Say | Never |
| --- | --- |
| evidence **envelope** (protocol term; "evidence package" ok user-facing) | — |
| subject / artifact | "file" as the protocol concept |
| storage **system** / settlement **system** | storage chain / anchoring chain |
| multi-system settlement receipts / multi-chain anchoring | cross-chain proof |
| locally verified evidence | verified claim |
| FileOnChain Cloud | "the FileOnChain product/v1 product" |
| reference SDK / reference implementations | "the protocol SDK" |
| Agent Evidence Profile claims | AI metadata in the generic schema |

- An envelope proves existence, integrity, signing keys, and timing —
  **never claim it proves truth, legal validity, factual accuracy, or
  legal authorship**. Signed claims are assertions by the signer.
- Artifact signatures ≠ envelope signatures: who signed the subject vs
  who assembled the complete envelope. Report and describe them
  separately; never collapse verification results into one green
  "verified".
- Generic protocol surfaces must stay AI-free: agent semantics live only
  in the Agent Evidence Profile. Cloud-only fields (DB ids, billing,
  retention, access rules) must never be inserted into portable envelopes.
- Durability claims must name their dependency: retrieval works "provided
  the underlying storage history is available"; an indexer is still
  normally required for efficient discovery.
- Never describe a chain beyond its `integrationStatus`
  (`docs/integrations/status.md`); mocked flows are never "shipped".
- Legacy market vocabulary (FOCAT, validator, jury, challenge, bond,
  slash, governor, timelock, bridge, fee split, verification market) must
  not reappear outside the archive-branch reference and ADR 0001.

## Gotchas

- **`@polkadot/util-crypto` must stay on 13.5.9 everywhere.** The root
  overrides pin it, but pnpm's auto-installed peers can still materialize
  14.x, whose `@scure/sr25519` code SWC-minifies into an illegal octal escape
  inside a template literal and breaks `next build`. That's why `apps/web`
  lists `@polkadot/util` and `@polkadot/util-crypto` as direct deps. If
  `pnpm-lock.yaml` ever grows a `util-crypto@14` entry, the build will fail
  at "Collecting page data".
- **Client/server boundaries.** Wallet code, Zustand stores, and anything using
  `window`/browser crypto must run in Client Components (`"use client"`). Chain
  SDKs pull in browser-only globals — dynamic-import them inside client code
  where needed.
- **Webpack stub for `@autonomys/auto-dag-data`.** `apps/web/next.config.ts`
  replaces the package's `dist/encryption/index.js` with
  `src/utils/empty-module.ts` and ignores `@peculiar/webcrypto`, because that
  subpath instantiates `node:crypto` at module load and breaks the client
  bundle. **Do not delete `apps/web/src/utils/empty-module.ts`** — it has no
  TS importers but is referenced by the webpack config.
- **`apps/web/src/lib/crypto/aes.ts`** is a real implementation stub kept
  for future wiring, even though nothing imports it yet.
- **Vercel** builds from Root Directory `apps/web`.

## Conventions

- TypeScript + React function components; Tailwind for styling; `clsx` /
  `tailwind-merge` (via `src/lib/cn.ts`) for conditional classes.
- Match surrounding naming: `use<Name>States` for stores, `use<Family>Wallet`
  for wallet hooks, `PascalCase.tsx` for components.
- Keep webapp imports on the `@/` alias; shared chain data imports from
  `@fileonchain/sdk`. Prefer editing the SDK chain registry / mock layer over
  sprinkling constants through components.
- Before finishing a change, run `pnpm build` and confirm it's green.

## Git workflow

Branch from `origin/main` (`git fetch` first), commit in small logical steps
explaining *why*, and open a PR against `main` (`gh pr create`). Branch
prefixes: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`.
