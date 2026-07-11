# FileOnChain

**One developer interface that creates portable, independently verifiable
evidence packages across storage and settlement systems** — the flagship
use case: **tamper-evident audit trails for AI agents**.

Hash an artifact (an agent's report, a build output, a tool-call log), sign
it with an agent, wallet, or organization key, settle it on public systems,
and hand back one portable evidence envelope — validated locally by the
open-source verifier (`fileonchain verify evidence.json`), with no
FileOnChain service in the loop. Storage is optional and off by default;
there is no token anywhere.

FileOnChain is four explicitly separate layers: the neutral **FileOnChain
Evidence Protocol**, the opinionated **Agent Evidence Profile**
(`org.fileonchain.agent/v1`), the hosted **FileOnChain Cloud** product,
and the MIT-licensed **reference implementations** in this repository.

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
│   ├── protocol/       @fileonchain/protocol — the FileOnChain Evidence Protocol core (+ conformance fixtures)
│   ├── agent-profile/  @fileonchain/agent-profile — the Agent Evidence Profile (org.fileonchain.agent/v1)
│   ├── utils/          @fileonchain/utils — network registry, legacy evidence + manifest schemas, CID + anchor payload core
│   ├── verify/         @fileonchain/verify — deterministic local verifier (library + `fileonchain verify|migrate` CLI)
│   ├── sdk-<family>/   @fileonchain/sdk-evm … sdk-hedera — one settlement client per chain family (×12)
│   ├── api/            @fileonchain/api — typed client for the FileOnChain Cloud HTTP API
│   ├── sdk/            @fileonchain/sdk — the reference SDK umbrella (evidence, protocol, agent-profile, families, api)
│   └── mcp/            @fileonchain/mcp — MCP server for AI agents (registry lookups, API anchoring)
└── contracts/          Foundry project: FileRegistry, CachePayments, DonationEscrow + tests
```

## The SDK

[`@fileonchain/sdk`](packages/sdk/README.md) is the **reference SDK**: the
root entry re-exports the network registry and utilities, `./evidence` is
the high-level evidence experience (`createEvidence`, `sealAgentRun`,
receipt helpers), `./protocol` and `./agent-profile` re-export the protocol
core and the Agent Evidence Profile, `./<family>` subpaths expose one
settlement client per chain family, and `./api` is the FileOnChain Cloud
client. The chain registry in [`@fileonchain/utils`](packages/utils) is the
single source of truth for supported networks and deployed addresses.

```ts
import { CHAINS, getChain } from "@fileonchain/sdk";       // registry + utils
import { sealAgentRun } from "@fileonchain/sdk/evidence";  // evidence envelopes
import { anchorCID } from "@fileonchain/sdk/evm";          // or the standalone @fileonchain/sdk-evm
```

| Package | Use it when |
|---|---|
| `@fileonchain/sdk` | You want the reference SDK under one install (`/evidence`, `/protocol`, `/agent-profile`, per-family and `/api` subpaths) |
| `@fileonchain/protocol` | You only need the Evidence Protocol core — envelopes, canonical encoding, digests, adapters, migration |
| `@fileonchain/agent-profile` | You represent AI-agent runs as evidence (`org.fileonchain.agent/v1`) |
| `@fileonchain/utils` | You only need chain metadata, CID validation, or payload parsing |
| `@fileonchain/sdk-<family>` | You settle on one family and want the smallest dependency surface |
| `@fileonchain/verify` | You need to verify evidence — locally, without trusting FileOnChain |
| `@fileonchain/api` | You go through FileOnChain Cloud with a dashboard key (`fok_…`) |
| `@fileonchain/mcp` | You want FileOnChain tools in an MCP-capable AI agent |

## Integrations — honest statuses

Every network in the registry carries an explicit `integrationStatus`
(designed → … → audited); product surfaces never describe a network beyond
it. The full per-network table lives in
[docs/integrations/status.md](docs/integrations/status.md). The launch set:

| System | Role | Status |
|---|---|---|
| **Autonomys** (mainnet + Taurus) | Primary storage system | Integrated into the webapp |
| **Solana** (mainnet + devnet) | Non-EVM settlement demonstration | Integrated into the webapp |
| **EVM** (Sepolia, Auto EVM Chronos) | Contract-based settlement (anchor-only FileRegistry) | Testnet deployed |
| Aptos · Sui · Starknet · NEAR · Cosmos · TRON · Cardano · TON · Hedera | Roadmap adapters | Implemented (SDK clients) |

An earlier experimental verification-market design (FOCAT token, staking,
juries, governance) was removed and is preserved, unmaintained, on the
[`archive/focat-verification-market`](https://github.com/FileOnchain/fileonchain-org/tree/archive/focat-verification-market) branch
(see [ADR 0001](docs/adr/0001-remove-focat-and-the-verification-market.md)).

## Documentation

- **A. Protocol specification (normative):** [docs/protocol/evidence-protocol.md](docs/protocol/evidence-protocol.md)
- **B. Agent Evidence Profile v1:** [docs/profiles/agent-evidence-v1.md](docs/profiles/agent-evidence-v1.md)
- **C. FileOnChain Cloud (non-normative product overview):** [docs/product/fileonchain-cloud.md](docs/product/fileonchain-cloud.md)
- **D. Integration status:** [docs/integrations/status.md](docs/integrations/status.md)
- **E. Architecture decision records:** [docs/adr/](docs/adr/)
- **Umbrella overview:** [docs/whitepaper.md](docs/whitepaper.md)

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
