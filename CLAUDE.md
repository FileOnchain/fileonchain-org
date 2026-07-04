# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep it current when
architecture or conventions change.

## What this is

FileOnChain — a pnpm workspace monorepo:

- **`apps/web`** — Next.js webapp for anchoring file CIDs across twelve chain
  families (EVM, Substrate, Solana, Aptos, Cosmos, Sui, Starknet, NEAR, TRON,
  Cardano, TON, Hedera), paying for an encrypted private cache, and funding
  public infrastructure via donations.
- **`packages/sdk`** — `@fileonchain/sdk`, the publishable SDK. **Single
  source of truth** for supported networks, contract addresses, ABIs, and the
  anchor clients. The webapp consumes it via `workspace:*`.
- **`contracts/`** — one directory per runtime (`evm/` Foundry, `aptos/` +
  `sui/` Move, `starknet/` Cairo, `near/` Rust) — see `contracts/README.md`;
  per-chain deploy runbooks live in `docs/deploy/`.

**Anchoring is real where a chain is provisioned; everything else is mock.**
The pay-as-you-go upload flow sends real transactions through
`apps/web/src/lib/anchor/*` (per-family `@fileonchain/sdk` clients) and falls
back to `apps/web/src/lib/mock/*` only when a chain has nothing deployed
(`ChainNotProvisionedError`). Registry reads, cache, donations, and the
indexer still resolve through the mock layer — see "Mock layer" below.

## Commands

Run from the repo root:

```bash
pnpm dev            # webapp dev server on http://localhost:3000
pnpm build          # builds SDK then webapp (tsc + lint; the real gate)
pnpm lint           # SDK typecheck + webapp ESLint
pnpm start          # serve the webapp production build
pnpm clean          # remove build outputs
```

Or scope to one package: `pnpm --filter @fileonchain/sdk build`,
`pnpm --filter @fileonchain/web dev`.

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

Contracts (only when touching Solidity):

```bash
cd contracts/evm && forge build && forge test
```

After changing a contract, regenerate the SDK ABIs:
`cd packages/sdk && node scripts/extract-abis.mjs`.

## Package manager & runtime

pnpm **>= 10** (pinned via `packageManager: pnpm@10.28.1` in the root
manifest) and Node **>= 20**. Use pnpm, not npm/yarn/bun. The root
`package.json` carries workspace-wide `pnpm.overrides` /
`onlyBuiltDependencies`; the `@polkadot/*` overrides pin transitive versions
to keep the API surface consistent — don't remove them casually (see Gotchas).

## Architecture

### The SDK — source of truth (`packages/sdk`)

- `src/chains.ts` — `ChainConfig` registry. `CHAINS` is a
  `readonly ChainConfig[]`; look up with `getChain(id)` /
  `getChainsByFamily(family)`; `DEFAULT_CHAIN_ID` is
  `substrate:autonomys-mainnet`. Contract addresses live **on the chain
  entries** (`registryContract`, `cacheContract`, `donationContract`,
  `programId`, `moduleAddress`, `palletContract`) — no separate address maps.
  Explorer URLs come from `buildTxUrl` / `buildAddressUrl`. Family-specific
  provisioning fields are optional and appear only where relevant:
  `memoAnchoring` (the deliberate on-switch for memo/metadata/comment
  anchoring — Cosmos, TRON, Cardano, TON; true on their testnets, flipped on
  mainnets after QA), `bech32Prefix` (Cosmos), `hcsTopicId` (Hedera), and
  `embedsChunkData` (chunk bytes ride along only on Autonomys). Every family
  has mainnet **and testnet** entries (`testnet: true`); `MAINNET_CHAINS` /
  `TESTNET_CHAINS` / `getVisibleChains(showTestnets)` split them — webapp
  pickers use `useVisibleChains()` (preference-driven), static marketing copy
  counts `MAINNET_CHAINS`. **To add or change a chain or a deployed address,
  edit `chains.ts` — never hardcode chain data in webapp components** (see
  `docs/chains/checklist.md` for the full chain-addition checklist).
- `src/types.ts` — `ChainFamily`, `ChainId` (template-literal
  `` `${ChainFamily}:${string}` ``), `CIDRegistryRecord`.
- `src/abis/*` — generated from `contracts/evm/out` by `scripts/extract-abis.mjs`;
  don't hand-edit.
- `src/anchor.ts` — the chain-agnostic anchoring vocabulary: versioned JSON
  payloads (`buildFileAnchorPayload` / `buildChunkAnchorPayload` /
  `parseAnchorPayload`) written identically on every family, the
  `AnchorChunk` / `ChunkedAnchorReceipt` / `AnchorProgress` types, and the
  provisioning seam (`isChainProvisioned`, `ChainNotProvisionedError` —
  thrown by family clients when a chain has nothing deployed, so callers can
  fall back to a simulated flow).
- Family clients, one subpath each (`@fileonchain/sdk/<family>` for all
  twelve families), all exposing `anchorChunkedFile` with the same
  progress/receipt shape plus a file-level `anchorCID*` for the server
  worker: `src/evm/` (peer viem) — `FileRegistry.anchorCID` per chunk +
  file; `src/substrate/` (peer @polkadot/api) — `utility.batchAll` of
  `system.remarkWithEvent`, chunk bytes riding along only where
  `embedsChunkData` is set (Autonomys); `src/solana/` (peer
  @solana/web3.js) — SPL Memo (native program, needs no deployment). The
  other nine (`aptos`, `cosmos`, `sui`, `starknet`, `near`, `tron`,
  `cardano`, `ton`, `hedera`) are **dependency-free**: the SDK owns payload
  building, ordering, batching, size validation, and progress, and a
  minimal structural signer interface owns transport — callers adapt wallet
  providers (browser) or chain SDKs (server) to it. Sui and Starknet batch
  all anchors into one PTB/multicall per approval; memo/metadata/comment
  families send one payload per transaction with pre-flight size checks.
  Peer deps are **optional**; the core entry stays dependency-free.
- Package `exports` point at `src/*.ts` for the workspace (the webapp lists
  the SDK in `transpilePackages`); `publishConfig.exports` point at `dist/`
  (built with tsup) for npm consumers.

### The webapp (`apps/web`)

- **`@/*` path alias** → `apps/web/src/*`. Shared chain types/metadata import
  from `@fileonchain/sdk`; only web-specific code uses `@/...`.
- **`src/app/`** — App Router. Routes: `/` (upload), `/explorer` (+ `/explorer/[cid]`),
  `/cache`, `/donations`, `/leaderboard`, `/profile/[address]`, `/login`, and
  the auth-guarded `/dashboard` (+ `logs`, `credits`, `keys`, `byok`,
  `preferences` subroutes). API routes under `app/api/`: the mock trio (`cid`,
  `search-file`, `upload-fallback`) plus the account backend (`auth`,
  `wallets`, `credits`, `keys`, `byok`, `uploads`, `preferences`,
  `organizations`) and the API-key-scoped `v1/` namespace (`v1/anchor`,
  `v1/credits`).
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
  `useDonationsStates`, `usePreferencesStates` — localStorage-persisted
  mirror of display preferences: testnet visibility, date format, analytics
  opt-out; hydrated post-mount like the theme store, synced from the server
  row by the preferences page).
- **`src/lib/`** — `anchor/` (real pay-as-you-go sends: one sender per
  family wrapping the SDK clients, dispatched by `anchorFileOnChain`; wallet
  handles come from `useWalletStates.getState()`, heavy chain deps are
  dynamic-imported), `cid/format.ts` (display formatting), `crypto/` (AES-GCM
  stub), `mock/` (see below), `site.ts` / `analytics.ts` / `faq.ts` (SEO).
- **`src/types/types.ts`** — web-only types (`Account`). `ChainFamily`,
  `ChainId`, `CIDRegistryRecord` come from `@fileonchain/sdk`.

### Mock layer

`apps/web/src/lib/mock/*` returns deterministic fake data and is the seam for
real integration. Each file carries a `/* TODO: wire to … */` marker naming
the real call to make (`registry.ts` → contract reads; `cid-indexer.ts` → an
indexer; `cache.ts`, `donations.ts` → their contracts). `upload.ts` is
already wired — it survives only as the fallback `useFileUploader` uses when
`lib/anchor` throws `ChainNotProvisionedError`. When implementing real
behavior, replace the mock body and keep the exported signature stable so
callers don't change.

### Account backend (auth, DB, credits, API keys, BYOK)

The account system is **real** (NextAuth v5 + Neon Postgres + Drizzle) while
chain-side operations behind it stay mock:

- **DB** — schema in `src/lib/db/schema.ts` (Auth.js tables + `wallets`,
  `auth_nonces`, `api_keys`, `credit_ledger`, `deposits`, `activity_logs`,
  `byok_keys`, `upload_jobs`, `user_preferences`, `organizations`,
  `organization_members`); client in `src/lib/db/index.ts` (Neon
  **WebSocket** driver — credit debits need interactive transactions; created
  lazily so builds pass without `DATABASE_URL`). Migrations live in
  `apps/web/drizzle/` (`db:generate` after schema edits). Money is bigint
  micro-USDC. Server-only env access goes through `src/lib/env.ts`.
- **Auth** — `src/lib/auth/` (`config.ts`, `index.ts` exporting
  `auth`/`requireUser`). JWT sessions. Google/GitHub providers register only
  when their env creds are set; the `"wallet"` Credentials provider accepts a
  nonce-bound sign-message proof verified per family in
  `verify-wallet.ts` (EVM viem, Substrate signatureVerify, Solana/Aptos
  ed25519; Tier 2 verifiers live under `lib/auth/verifiers/` — ADR-36
  Cosmos, Sui personal-message intent, SNIP-12 via on-chain
  `is_valid_signature` for Starknet, NEP-413 + access-key RPC binding for
  NEAR, TIP-191 recovery for TRON, CIP-8 COSE_Sign1 for Cardano).
  `WALLET_FAMILIES` in `wallet-message.ts` is the auth-capable list — TON
  and Hedera anchor but can't sign in yet. Client proof collection is
  shared via `hooks/useWalletProof.ts`.
  Guards: `app/dashboard/layout.tsx` server layout redirect + `requireUser()`
  in routes — **no Edge middleware** (Neon driver is Node-only).
- **Services** — `src/lib/server/*`: `credits.ts` (ledger, advisory-lock
  debits), `api-keys.ts` (hashed `fok_` keys), `anchor-service.ts` +
  `anchor-worker.ts` (server-side anchoring shared by `/api/uploads` and
  `/api/v1/anchor` — anchors the file CID for real through the SDK clients
  when the chain is provisioned AND its `ANCHOR_*` signer env vars are set
  (all documented in `apps/web/.env.example`; EVM/Substrate/Solana/Aptos
  signers are inline in the worker, every Tier 2 family has a module under
  `lib/server/anchor-signers/`); otherwise falls
  back to the deterministic mock; on a real send failure the job is marked failed
  and credits are refunded), `byok.ts` + `lib/byok/providers.ts` (provider
  registry; keys sealed by `lib/crypto/secretbox.ts` with
  `BYOK_ENCRYPTION_KEY`), `activity.ts` (`logActivity`), `queries.ts`
  (dashboard reads), `preferences.ts` (upsert per-user preferences; shared
  field vocabulary + validation lives in the client-safe
  `src/lib/preferences.ts`), `organizations.ts` (owner/admin/member role
  model; throws `OrgError(status, message)` which the org routes map via
  `app/api/organizations/shared.ts`).
- **Mock seams to make real later**: deposit confirmation
  (`api/credits/deposit/[id]/confirm` — replace with a USDC Transfer
  watcher), `byok.ts` validation (real Auto Drive call), and the per-chain
  deployments themselves — all anchoring code paths are written; real sends
  wait on deployed contracts/modules/topics recorded in `chains.ts` (see
  `docs/deploy/`) plus funded `ANCHOR_*` signers. Mainnet
  memo-anchoring flags (Cosmos/TRON/Cardano/TON) flip on after testnet QA.
- Env vars are documented in `apps/web/.env.example`; all are optional for
  `pnpm build`, but runtime account features need `DATABASE_URL` +
  `AUTH_SECRET` (and `BYOK_ENCRYPTION_KEY` for BYOK).

### SEO & analytics

`src/lib/site.ts` holds `siteConfig` (name, canonical `url`, shared
descriptions) and `gaId`. Both read from env: `NEXT_PUBLIC_SITE_URL` (origin,
no trailing slash; defaults to `https://fileonchain.org`) and
`NEXT_PUBLIC_GA_ID` (GA4 id — see `apps/web/.env.example`). The root
`layout.tsx` sets `metadataBase`, a title `template`, default OG/Twitter tags,
`robots`, Organization + WebSite JSON-LD, and mounts GA4 via
`components/AnalyticsGate.tsx` **only when `gaId` is set AND the user's
analytics-cookies preference allows it** (`usePreferencesStates`; opting out
also flips Google's `ga-disable-<id>` global and `trackEvent` checks it). `robots.ts` and
`sitemap.ts` under `src/app/` are generated from `siteConfig`. **Custom
events:** fire them through `trackEvent(name, params)` in `src/lib/analytics.ts`
— a typed wrapper over `sendGAEvent` that no-ops when `gaId` is unset. Add new
events to the `AnalyticsEvents` map (GA4 snake_case names, flat scalar params,
no PII) rather than calling `sendGAEvent` directly. **Structured data:**
Organization + WebSite JSON-LD lives in the root layout; the home FAQ emits
`FAQPage` JSON-LD from `src/lib/faq.ts` (single source shared with
`FaqAccordion`). **Social image:** `src/app/opengraph-image.tsx` renders the
default OG/Twitter card via `next/og` `ImageResponse` (no static asset).
**Verification:** set `GOOGLE_SITE_VERIFICATION` (server-only env) to emit the
Search Console meta tag. `viewport`/`theme-color` are a `viewport` export in the
root layout. **Per-page
metadata:** server pages export `metadata`/`generateMetadata` directly; client
pages (`cache`, `explorer`) carry a sibling `layout.tsx` that exports it (a
Client Component can't). Each page sets its own `alternates.canonical`;
`/dashboard` is `robots: { index: false }`. Prefer editing `siteConfig` over
hardcoding URLs or titles.

## Gotchas

- **`@polkadot/util-crypto` must stay on 13.5.9 everywhere.** The root
  overrides pin it, but pnpm's auto-installed peers can still materialize
  14.x, whose `@scure/sr25519` code SWC-minifies into an illegal octal escape
  inside a template literal and breaks `next build`. That's why `apps/web`
  lists `@polkadot/util` and `@polkadot/util-crypto` as direct deps — they
  satisfy the peers of `@polkadot/extension-dapp` / `@autonomys/auto-utils`
  with the pinned version. If `pnpm-lock.yaml` ever grows a
  `util-crypto@14` entry, the build will fail at "Collecting page data".
- **Client/server boundaries.** Wallet code, Zustand stores, and anything using
  `window`/browser crypto must run in Client Components (`"use client"`). Chain
  SDKs pull in browser-only globals — dynamic-import them inside client code
  where needed.
- **Webpack stub for `@autonomys/auto-dag-data`.** `apps/web/next.config.ts`
  replaces the package's `dist/encryption/index.js` with
  `src/utils/empty-module.ts` and ignores `@peculiar/webcrypto`, because that
  subpath instantiates `node:crypto` at module load and breaks the client
  bundle. The uploader never uses encryption. **Do not delete
  `apps/web/src/utils/empty-module.ts`** — it has no TS importers but is
  referenced by the webpack config.
- **`apps/web/src/lib/crypto/aes.ts`** is a real implementation stub kept
  for future wiring, even though nothing imports it yet. Leave it unless
  intentionally wiring real encryption.
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
