# FileOnChain

Upload files permanently to any chain — EVM, Substrate, Solana, and Aptos.
Anchor CIDs onchain, pay for private encrypted cache, and fund public infrastructure through donations.

## Stack

- **Next.js 15** (App Router) + **React 19 RC**
- **TypeScript** + **Tailwind CSS 3**
- **Zustand** for state, **Radix UI** primitives, **framer-motion** for transitions
- **viem**, **@solana/web3.js**, **@aptos-labs/ts-sdk**, **@polkadot/api** for chain SDKs
- **Foundry** (separate `contracts/` workspace) for the on-chain registry / cache / donation contracts

## Project layout

```
fileonchain-org/
├── contracts/          Foundry project: FileRegistry, CachePayments, DonationEscrow + tests
├── public/             Static assets (logos, chain icons)
├── src/
│   ├── app/            App Router routes (upload, explorer, cache, donations, dashboard)
│   ├── components/     UI primitives (ui/), layout (Nav/Footer/PageShell), features
│   ├── hooks/          useSubstrateWallet, useEVMWallet, useSolanaWallet, useAptosWallet, …
│   ├── lib/
│   │   ├── chains/     12-chain registry + per-family helpers
│   │   ├── contracts/  Compiled ABIs + placeholder addresses
│   │   ├── cid/        CID validation + formatting
│   │   ├── crypto/     WebCrypto AES-GCM encryption stub
│   │   └── mock/       Deterministic mock data with /* TODO */ markers
│   ├── states/         Zustand stores (theme, wallet, chains, cache, donations)
│   ├── types/          Shared types (ChainId, ChainFamily, contracts, etc.)
│   └── utils/          File processing helpers (generateCIDs, readFileContent, …)
├── tailwind.config.ts
└── package.json
```

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
pnpm dev
```

Open <http://localhost:3000>.

### Contracts (Foundry)

The webapp only consumes compiled ABIs and placeholder addresses. To deploy or
test the contracts:

```bash
cd contracts
forge install                 # installs forge-std
forge build
forge test
```

## Scripts

| Command       | What it does                           |
| ------------- | -------------------------------------- |
| `pnpm dev`    | Run the development server             |
| `pnpm build`  | Produce a production build             |
| `pnpm start`  | Serve the production build             |
| `pnpm lint`   | Run ESLint across the project          |

## Requirements

- Node.js **>= 20**
- pnpm **>= 10** (see `packageManager` in `package.json`)

Enable [Corepack](https://nodejs.org/api/corepack.html) if you don't have pnpm installed yet:

```bash
corepack enable
corepack prepare pnpm@10.28.1 --activate
```

## Mock-vs-real

Every chain / contract interaction is mocked under `src/lib/mock/` with
`/* TODO: … */` markers. Wire them to real RPC and contract reads as you
deploy. The `src/lib/contracts/abis/*.json` files are already the compiled
outputs from `contracts/out/`.

## Deploy on Vercel

```bash
vercel deploy
```

See the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for details.