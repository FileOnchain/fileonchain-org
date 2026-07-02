# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep it current when
architecture or conventions change.

## What this is

FileOnChain — a pnpm workspace monorepo:

- **`apps/web`** — Next.js webapp for anchoring file CIDs across four chain
  families (EVM, Substrate, Solana, Aptos), paying for an encrypted private
  cache, and funding public infrastructure via donations.
- **`packages/sdk`** — `@fileonchain/sdk`, the publishable SDK. **Single
  source of truth** for supported networks, contract addresses, ABIs, and the
  anchor clients. The webapp consumes it via `workspace:*`.
- **`contracts/`** — Foundry workspace with the Solidity registry / cache /
  donation contracts.

**The webapp is a front-end shell over a mock backend.** Every chain and
contract interaction currently resolves through `apps/web/src/lib/mock/*`.
The SDK's EVM/Substrate clients are the real seam — see "Mock layer" below.

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

There is no unit-test runner for the webapp. **Verify changes with
`pnpm build`** — it typechecks and lints everything and catches
server/client boundary errors that `tsc` alone misses.

Contracts (only when touching Solidity):

```bash
cd contracts && forge build && forge test
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
  Explorer URLs come from `buildTxUrl` / `buildAddressUrl`. **To add or change
  a chain or a deployed address, edit `chains.ts` — never hardcode chain data
  in webapp components.**
- `src/types.ts` — `ChainFamily`, `ChainId` (template-literal
  `` `${ChainFamily}:${string}` ``), `CIDRegistryRecord`.
- `src/abis/*` — generated from `contracts/out` by `scripts/extract-abis.mjs`;
  don't hand-edit.
- `src/evm/` (`@fileonchain/sdk/evm`) — real `FileRegistry.anchorCID` /
  `getCIDRecord` via viem. `src/substrate/` (`@fileonchain/sdk/substrate`) —
  anchoring via versioned `system.remarkWithEvent` JSON payloads
  (`buildAnchorRemark` / `parseAnchorRemark`). viem and @polkadot/api are
  **optional peer deps**; the core entry stays dependency-free.
- Package `exports` point at `src/*.ts` for the workspace (the webapp lists
  the SDK in `transpilePackages`); `publishConfig.exports` point at `dist/`
  (built with tsup) for npm consumers.

### The webapp (`apps/web`)

- **`@/*` path alias** → `apps/web/src/*`. Shared chain types/metadata import
  from `@fileonchain/sdk`; only web-specific code uses `@/...`.
- **`src/app/`** — App Router. Routes: `/` (upload), `/explorer` (+ `/explorer/[cid]`),
  `/cache`, `/donations`, `/dashboard`. API routes under `app/api/`
  (`cid`, `search-file`, `upload-fallback`).
- **`src/components/`** — `ui/` primitives (Button, Modal, Card, …), `layout/`
  (Nav, Footer, PageShell), and feature folders (`explorer/`, `cache/`,
  `donations/`, `chain/`, `upload/`, `onboarding/`, `registry/`). Bare files in
  `components/` are page sections (Hero, HowItWorks, …).
- **`src/hooks/`** — one wallet hook per family (`useEVMWallet`,
  `useSubstrateWallet`, `useSolanaWallet`, `useAptosWallet`) plus `useWallet`,
  `useChain`, `useFileUploader`, `useCachePayment`, `useDonation`.
- **`src/states/`** — Zustand stores, exported as `use<Name>States`
  (`useWalletStates`, `useChainsStates`, `useThemeStates`, `useCacheStates`,
  `useDonationsStates`).
- **`src/lib/`** — `cid/format.ts` (display formatting), `crypto/` (AES-GCM
  stub), `mock/` (see below), `site.ts` / `analytics.ts` / `faq.ts` (SEO).
- **`src/types/types.ts`** — web-only types (`Account`). `ChainFamily`,
  `ChainId`, `CIDRegistryRecord` come from `@fileonchain/sdk`.

### Mock layer

`apps/web/src/lib/mock/*` returns deterministic fake data and is the seam for
real integration. Each file carries a `/* TODO: wire to … */` marker naming
the real call to make (`upload.ts` → `@fileonchain/sdk/evm` `anchorCID` /
`@fileonchain/sdk/substrate` `anchorCIDWithRemark`; `registry.ts` → contract
reads; `cid-indexer.ts` → an indexer; `cache.ts`, `donations.ts` → their
contracts). When implementing real behavior, replace the mock body and keep
the exported signature stable so callers don't change.

### SEO & analytics

`src/lib/site.ts` holds `siteConfig` (name, canonical `url`, shared
descriptions) and `gaId`. Both read from env: `NEXT_PUBLIC_SITE_URL` (origin,
no trailing slash; defaults to `https://fileonchain.org`) and
`NEXT_PUBLIC_GA_ID` (GA4 id — see `apps/web/.env.example`). The root
`layout.tsx` sets `metadataBase`, a title `template`, default OG/Twitter tags,
`robots`, Organization + WebSite JSON-LD, and mounts `<GoogleAnalytics>` from
`@next/third-parties/google` **only when `gaId` is set**. `robots.ts` and
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
- **`apps/web/src/utils/uploadChunks.ts` and `src/lib/crypto/aes.ts`** are
  real implementation stubs kept for future wiring, even though nothing
  imports them yet. Leave them unless intentionally wiring real uploads.
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
