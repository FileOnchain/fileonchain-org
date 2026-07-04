---
name: fileonchain-packages
description: Map of the @fileonchain/* workspace packages — what lives in utils vs the per-family SDKs vs api/mcp, how the @fileonchain/sdk umbrella re-exports them, and how to add a new family package.
---

# The @fileonchain/* package layout

| Package | Directory | What it is |
| --- | --- | --- |
| `@fileonchain/utils` | `packages/utils` | Dependency-free core: types, CID validation, the `CHAINS` registry, anchor payload vocabulary (`anchor.ts`), orchestration helpers (`helpers.ts`) |
| `@fileonchain/sdk-<family>` ×12 | `packages/sdk-<family>` | One anchor client per family. Peers: sdk-evm→viem, sdk-substrate→@polkadot/api, sdk-solana→@solana/web3.js; the other nine are dependency-free (structural signer interfaces). sdk-evm also owns the Foundry ABIs (`./abis` subpath, viem-free) and `scripts/extract-abis.mjs` |
| `@fileonchain/api` | `packages/api` | Typed client for the hosted HTTP API (`FileOnChainClient`) |
| `@fileonchain/sdk` | `packages/sdk` | Umbrella: root = utils + EVM ABIs; `./<family>` subpaths re-export the family packages; `./api` re-exports the API client. The webapp depends only on this |
| `@fileonchain/mcp` | `packages/mcp` | stdio MCP server (registry lookups + API-backed anchoring); not in webapp transpilePackages |

Conventions all packages share:

- Workspace `exports` point at `src/*.ts`; `publishConfig.exports` point at
  `dist/` (tsup, esm+cjs+dts). Internal deps are `workspace:^` so publishing
  rewrites them to real semver ranges.
- tsconfig extends `packages/tsconfig.base.json`; build with tsup, lint with
  `tsc --noEmit`; `pnpm build` at the repo root is the real gate.
- Every package the umbrella re-exports must be listed in
  `apps/web/next.config.ts` `transpilePackages` (Next consumes the `.ts`
  sources).
- After changing an EVM contract: `cd contracts/evm && forge build`, then
  `cd packages/sdk-evm && node scripts/extract-abis.mjs`.

## Adding a new family package

1. Add the chain entries in `packages/utils/src/chains.ts` and extend
   `ChainFamily` in `types.ts` (+ the `isChainProvisioned` switch in
   `anchor.ts`).
2. `packages/sdk-<family>` scaffolding: copy a dependency-free sibling
   (e.g. `sdk-ton`) — manifest, tsconfig, tsup config, `src/index.ts` built
   on `resolveFamilyChain` / `runSequentialChunkedAnchor` (or the batching
   helpers) from `@fileonchain/utils`.
3. Umbrella: add `packages/sdk/src/<family>.ts`, the `exports` +
   `publishConfig.exports` keys, tsup entry, and the `workspace:^` dep.
4. Add the package to webapp `transpilePackages`; wire
   `apps/web/src/lib/anchor/<family>.ts` and a wallet hook.
5. Follow `docs/chains/checklist.md` for the rest (webapp, auth, deploy docs).
