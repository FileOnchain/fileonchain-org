# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep it current when
architecture or conventions change.

## What this is

FileOnChain — a Next.js webapp for anchoring file CIDs across four chain
families (EVM, Substrate, Solana, Aptos), paying for an encrypted private
cache, and funding public infrastructure via donations. A separate Foundry
workspace under `contracts/` holds the Solidity registry / cache / donation
contracts.

**The webapp is a front-end shell over a mock backend.** Every chain and
contract interaction currently resolves through `src/lib/mock/*`. Real RPC and
contract wiring is a deliberate TODO — see "Mock layer" below.

## Commands

```bash
pnpm dev            # dev server on http://localhost:3000
pnpm build          # production build (runs tsc + lint; the real gate)
pnpm lint           # ESLint (next lint)
pnpm start          # serve the production build
pnpm clean          # rm -rf .next
npx tsc --noEmit    # standalone typecheck
```

There is no unit-test runner for the webapp. **Verify changes with
`pnpm build`** — it typechecks and lints the whole app and catches
server/client boundary errors that `tsc` alone misses.

Contracts (only when touching Solidity):

```bash
cd contracts && forge build && forge test
```

## Package manager & runtime

pnpm **>= 10** (pinned via `packageManager: pnpm@10.28.1`) and Node **>= 20**.
Use pnpm, not npm/yarn/bun — a `pnpm-lock.yaml` and pnpm-specific
`overrides` / `onlyBuiltDependencies` block is in `package.json`. The
`@polkadot/*` overrides pin transitive versions to keep the API surface
consistent; don't remove them casually.

## Architecture

- **`@/*` path alias** → `src/*` (see `tsconfig.json`). Always import with
  `@/...`, matching the existing code.
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
- **`src/lib/`** — `chains/` (registry + Solana/Aptos helpers), `contracts/`
  (compiled ABIs + placeholder addresses), `cid/` (validate/format), `crypto/`
  (AES-GCM stub), `mock/` (see below).
- **`src/types/types.ts`** — shared types. `ChainFamily`, `ChainId`
  (a template-literal `` `${ChainFamily}:${string}` ``, e.g.
  `substrate:autonomys-mainnet`), `Account`, `CIDRegistryRecord`.

### Chain registry — the source of truth

`src/lib/chains/registry.ts` is the single source of chain metadata. `CHAINS`
is a `readonly ChainConfig[]`; look up with `getChain(id)` and
`getChainsByFamily(family)`. `DEFAULT_CHAIN_ID` is
`substrate:autonomys-mainnet`. Explorer URLs come from `buildTxUrl` /
`buildAddressUrl`. **To add or change a chain, edit `registry.ts` — do not
hardcode chain data in components.**

### Mock layer

`src/lib/mock/*` returns deterministic fake data and is the seam for real
integration. Each file carries a `/* TODO: wire to … */` marker naming the real
call to make (`upload.ts` → viem `writeContract` / polkadot `signAndSend`;
`registry.ts` → contract reads; `cid-indexer.ts` → an indexer; `cache.ts`,
`donations.ts` → their contracts). When implementing real behavior, replace the
mock body and keep the exported signature stable so callers don't change.

### SEO & analytics

`src/lib/site.ts` holds `siteConfig` (name, canonical `url`, shared
descriptions) and `gaId`. Both read from env: `NEXT_PUBLIC_SITE_URL` (origin,
no trailing slash; defaults to `https://fileonchain.org`) and
`NEXT_PUBLIC_GA_ID` (GA4 id — see `.env.example`). The root
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

- **Client/server boundaries.** Wallet code, Zustand stores, and anything using
  `window`/browser crypto must run in Client Components (`"use client"`). Chain
  SDKs pull in browser-only globals — dynamic-import them inside client code
  where needed (e.g. `useSolanaWallet` does `await import("@/lib/chains/solana")`).
- **Webpack stub for `@autonomys/auto-dag-data`.** `next.config.ts` replaces the
  package's `dist/encryption/index.js` with `src/utils/empty-module.ts` and
  ignores `@peculiar/webcrypto`, because that subpath instantiates
  `node:crypto` at module load and breaks the client bundle. The uploader never
  uses encryption. **Do not delete `src/utils/empty-module.ts`** — it has no
  TS importers but is referenced by the webpack config.
- **`src/utils/uploadChunks.ts` and `src/lib/crypto/aes.ts`** are real
  implementation stubs kept for future wiring, even though nothing imports them
  yet. Leave them unless intentionally wiring real uploads.

## Conventions

- TypeScript + React function components; Tailwind for styling; `clsx` /
  `tailwind-merge` (via `src/lib/cn.ts`) for conditional classes.
- Match surrounding naming: `use<Name>States` for stores, `use<Family>Wallet`
  for wallet hooks, `PascalCase.tsx` for components.
- Keep imports on the `@/` alias. Prefer editing the chain registry / mock layer
  over sprinkling constants through components.
- Before finishing a change, run `pnpm build` and confirm it's green.

## Git workflow

Branch from `origin/main` (`git fetch` first), commit in small logical steps
explaining *why*, and open a PR against `main` (`gh pr create`). Branch
prefixes: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`.
