# Deploy: EVM chains

Deploys `FileRegistry` (and `CachePayments` / `DonationEscrow`) from
`contracts/evm/` with Foundry's `script/Deploy.s.sol`. One run per chain.

## Prerequisites

- Foundry installed (`forge --version`), `forge install` run in `contracts/evm/`.
- A funded deployer key on the target chain.
- An explorer API key if you pass `--verify` (Etherscan-family).

## Environment

`Deploy.s.sol` reads three env vars:

```bash
export PRIVATE_KEY=0x...          # deployer key (vm.envUint — required)
export TREASURY_ADDRESS=0x...     # CachePayments/DonationEscrow treasury (required)
export USDC_ADDRESS=0x...         # the chain's canonical USDC (optional)
```

`USDC_ADDRESS` is read with `vm.envOr` — leave it unset on testnets and the
script deploys a `MockUSDC` and wires `CachePayments` to it. On mainnets,
always set the chain's real USDC.

## Deploy

```bash
cd contracts/evm
forge script script/Deploy.s.sol \
  --rpc-url <RPC_URL> \
  --broadcast \
  --verify --etherscan-api-key $ETHERSCAN_API_KEY
```

Drop `--verify` if the chain's explorer isn't Etherscan-compatible and verify
manually afterwards. The script logs the deployed addresses:
`FileRegistry`, `MockUSDC` (testnets only), `CachePayments`, `DonationEscrow`.

## Networks

Tier 1 — deploy in this order (staging first):

| Network | Chain id | Chain entry | Notes |
| --- | --- | --- | --- |
| Base Sepolia | 84532 | `evm:84532` | Staging target — deploy and QA here first |
| Base | 8453 | `evm:8453` | First mainnet |
| Ethereum Sepolia | 11155111 | `evm:11155111` | |
| Ethereum | 1 | `evm:1` | Deploy last; gas is the expensive one |

Tier 1B — same command, per chain (mainnet + its testnet):

| Network | Mainnet id | Testnet | Testnet id |
| --- | --- | --- | --- |
| BNB Smart Chain | 56 | BSC Testnet | 97 |
| Avalanche C-Chain | 43114 | Fuji | 43113 |
| zkSync Era | 324 | zkSync Sepolia | 300 |
| Scroll | 534352 | Scroll Sepolia | 534351 |
| Linea | 59144 | Linea Sepolia | 59141 |
| Mantle | 5000 | Mantle Sepolia | 5003 |
| Blast | 81457 | Blast Sepolia | 168587 |
| Celo | 42220 | Alfajores | 44787 |

RPC URLs for every entry live on the chain configs in
`packages/sdk/src/chains.ts` — reuse them as `--rpc-url`.

**zkSync Era (324 / 300):** vanilla Foundry cannot broadcast to zkEVM. Use
[foundry-zksync](https://github.com/matter-labs/foundry-zksync)
(`forge script ... --zksync`) or zkSync's own tooling; the Solidity itself
needs no changes.

## After deploying

If the contracts changed since the last deploy, regenerate the SDK ABIs:

```bash
cd packages/sdk && node scripts/extract-abis.mjs
```

Then run `pnpm build` from the repo root and confirm it is green.

Record the result in `packages/sdk/src/chains.ts`: set `registryContract`
(and `cacheContract` / `donationContract` if you deployed them) on the
chain's `evm:<chainId>` entry, replacing `ZERO_ADDRESS`.
`isChainProvisioned` flips on from `registryContract` alone.

Fund the server signer: the account behind `ANCHOR_EVM_PRIVATE_KEY` needs
native gas on every EVM chain it serves.
