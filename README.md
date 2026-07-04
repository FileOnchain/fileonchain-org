# FileOnChain

Upload files permanently to any chain — EVM, Substrate, Solana, and Aptos.
Anchor CIDs onchain, pay for private encrypted cache, and fund public infrastructure through donations.

## Stack

- **pnpm workspace** monorepo: webapp + publishable SDK + Foundry contracts
- **Next.js 15** (App Router) + **React 19 RC**
- **TypeScript** + **Tailwind CSS 3**
- **Zustand** for state, **Radix UI** primitives, **framer-motion** for transitions
- **viem**, **@solana/web3.js**, **@aptos-labs/ts-sdk**, **@polkadot/api** for chain SDKs
- **Foundry** (separate `contracts/` workspace) for the on-chain registry / cache / donation contracts

## Project layout

```
fileonchain-org/
├── apps/
│   └── web/            Next.js webapp (fileonchain.org)
│       ├── public/     Static assets (logos, chain icons)
│       └── src/
│           ├── app/         App Router routes (upload, explorer, cache, donations, dashboard)
│           ├── components/  UI primitives (ui/), layout (Nav/Footer/PageShell), features
│           ├── hooks/       useSubstrateWallet, useEVMWallet, useSolanaWallet, useAptosWallet, …
│           ├── lib/         cid formatting, crypto stub, mock/ (deterministic mock data)
│           ├── states/      Zustand stores (theme, wallet, chains, cache, donations)
│           ├── types/       Web-only types
│           └── utils/       File processing helpers (generateCIDs, readFileContent, …)
├── packages/
│   ├── utils/          @fileonchain/utils — networks, contract addresses, CID + anchor payload core
│   ├── sdk-<family>/   @fileonchain/sdk-evm … sdk-hedera — one anchor client per chain family (×12)
│   ├── api/            @fileonchain/api — typed client for the hosted HTTP API
│   ├── sdk/            @fileonchain/sdk — umbrella re-exporting utils + every family + the API client
│   └── mcp/            @fileonchain/mcp — MCP server for AI agents (registry lookups, API anchoring)
└── contracts/          Foundry project: FileRegistry, CachePayments, DonationEscrow + tests
```

## The SDK

[`@fileonchain/sdk`](packages/sdk/README.md) lets anyone anchor file and folder
CIDs with the FileOnChain contracts without going through the frontend. The
chain registry in [`@fileonchain/utils`](packages/utils) is the single source
of truth for supported networks and deployed contract addresses — the webapp
consumes it through the umbrella as a workspace dependency.

```ts
import { CHAINS, getChain } from "@fileonchain/sdk";   // umbrella root = @fileonchain/utils + ABIs
import { anchorCID } from "@fileonchain/sdk/evm";      // or the standalone @fileonchain/sdk-evm
```

| Package | Use it when |
|---|---|
| `@fileonchain/sdk` | You want everything under one install (each family stays behind a subpath) |
| `@fileonchain/utils` | You only need chain metadata, CID validation, or payload parsing |
| `@fileonchain/sdk-<family>` | You anchor on one family and want the smallest dependency surface |
| `@fileonchain/api` | You anchor through the hosted API with a dashboard key (`fok_…`) |
| `@fileonchain/mcp` | You want FileOnChain tools in an MCP-capable AI agent |

## Supported chains (v2)

| Family | Chains |
|---|---|
| **EVM** | Ethereum, Base, Optimism, Arbitrum One, Polygon |
| **Substrate** | Autonomys Mainnet, Autonomys Taurus (testnet), Polkadot Asset Hub |
| **Solana** | Mainnet, Devnet |
| **Aptos** | Mainnet, Testnet |

## Getting started

```bash
pnpm install
pnpm dev        # runs the webapp on http://localhost:3000
```

### Contracts

The SDK ships ABIs generated from `contracts/evm/out/`. Contracts are
organized per runtime under `contracts/<runtime>/` (see `contracts/README.md`).
To deploy or test the EVM contracts:

```bash
cd contracts/evm
forge install                 # installs forge-std
forge build
forge test
```

## Scripts

Run from the repo root:

| Command       | What it does                                     |
| ------------- | ------------------------------------------------ |
| `pnpm dev`    | Run the webapp development server                |
| `pnpm build`  | Build every package (SDK first, then the webapp) |
| `pnpm start`  | Serve the webapp production build                |
| `pnpm lint`   | Typecheck the SDK + ESLint the webapp            |

## Requirements

- Node.js **>= 20**
- pnpm **>= 10** (see `packageManager` in `package.json`)

Enable [Corepack](https://nodejs.org/api/corepack.html) if you don't have pnpm installed yet:

```bash
corepack enable
corepack prepare pnpm@10.28.1 --activate
```

## Mock-vs-real

Every chain / contract interaction in the webapp is mocked under
`apps/web/src/lib/mock/` with `/* TODO: … */` markers. The SDK's EVM and
Substrate clients are the real seam — wire the mocks to them as contracts
deploy and the addresses in `packages/utils/src/chains.ts` fill in.

## Deploy on Vercel

The webapp lives in `apps/web` — set the Vercel project's **Root Directory**
to `apps/web`.

```bash
vercel deploy
```

See the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for details.
