# Deploy: EVM chains

Deploys the anchor-only v1 suite — `FileRegistry`, `CachePayments`,
`DonationEscrow` (plus `MockUSDC` on testnets) — from `contracts/evm/` with
Foundry's `script/Deploy.s.sol`. One run per chain.

Every contract deploys behind an OZ `TransparentUpgradeableProxy` whose
auto-created `ProxyAdmin` is owned by `ADMIN_ADDRESS` (default: the
deployer). `ADMIN_ADDRESS` is also the `FileRegistry` owner. Anchoring is
free beyond gas — there is no token, staking, or governance to wire.

## Prerequisites

- Foundry installed (`forge --version`); in `contracts/evm/` run
  `forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.4.0 OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0`
  (`lib/` is untracked).
- A funded deployer key on the target chain.
- An explorer API key if you pass `--verify` (Etherscan-family).

## Environment

Copy `contracts/evm/.env.example` to `contracts/evm/.env` (gitignored) and
fill it in — `forge script` loads it automatically. Or export the variables
directly:

```bash
export PRIVATE_KEY=0x...       # deployer key (optional — leave unset to sign
                               # with a Foundry keystore via `--account <name>`)
export TREASURY_ADDRESS=0x...  # CachePayments/DonationEscrow treasury (required)
export ADMIN_ADDRESS=0x...     # proxy-admin owner + registry owner (optional, default: deployer)
export USDC_ADDRESS=0x...      # the chain's canonical USDC (optional)
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
manually afterwards. The script logs **proxy and implementation** addresses
for `FileRegistry`, `CachePayments`, and `DonationEscrow`, plus the
`MockUSDC` address when it deploys one.

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
`packages/utils/src/chains.ts` — reuse them as `--rpc-url`.

**Autonomys Auto EVM (870 / Chronos 8700):** a Substrate Frontier chain —
its block headers omit `mixHash`, so forge fails with
`` header validation error: `prevrandao` not set `` when pointed at it
directly. Run the bundled proxy and target that instead:

```bash
node script/frontier-rpc-proxy.mjs https://auto-evm.chronos.autonomys.xyz/ws 8546 &
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8546 --account deployer --broadcast
```

Gas is paid in AI3 (tAI3 on Chronos — faucet via the Autonomys Discord).
The explorer is Blockscout, so drop `--verify` and verify everything from
the broadcast file afterwards:

```bash
node script/verify-broadcast.mjs broadcast/Deploy.s.sol/8700/run-latest.json \
  https://explorer.auto-evm.chronos.autonomys.xyz/api
```

**Gas estimation:** forge's batch simulation can underestimate gas for
cold-storage calls and abort a run mid-script (seen on Chronos). Adding
`--gas-estimate-multiplier 200` to the deploy is cheap insurance on any
chain.

**zkSync Era (324 / 300):** vanilla Foundry cannot broadcast to zkEVM. Use
[foundry-zksync](https://github.com/matter-labs/foundry-zksync)
(`forge script ... --zksync`) or zkSync's own tooling; the Solidity itself
needs no changes.

## After deploying

If the contracts changed since the last deploy, regenerate the SDK ABIs
from the Foundry build output:

```bash
cd contracts/evm && forge build
cd ../../packages/sdk-evm && node scripts/extract-abis.mjs
```

Then run `pnpm build` from the repo root and confirm it is green.

Record the result in `packages/utils/src/chains.ts` on the chain's
`evm:<chainId>` entry — always the **proxy** addresses, never the
implementations (proxies survive upgrades): set `registryContract`,
`cacheContract`, `donationContract`, and `usdcContract` (the real USDC on
mainnets, the deployed `MockUSDC` on testnets), replacing `ZERO_ADDRESS`.
`isChainProvisioned` flips on from `registryContract` alone; cache payments
additionally need `cacheContract` + `usdcContract`. Set the entry's
`integrationStatus` to match reality (`"testnet-deployed"`,
`"mainnet-deployed"`, `"webapp-integrated"` once QA'd end-to-end) — never
above what is actually deployed and verified.

Fund the server signer: the account behind `ANCHOR_EVM_PRIVATE_KEY` needs
native gas on every EVM chain it serves. Anchoring itself is permissionless
and free beyond gas.

## Proxies and upgrades

Every contract deploys behind a `TransparentUpgradeableProxy`; each proxy's
auto-created `ProxyAdmin` is owned by `ADMIN_ADDRESS`. Upgrades are
`ProxyAdmin.upgradeAndCall` transactions from that owner — deploy the new
implementation, then point the proxy at it; the proxy address in `chains.ts`
never changes.
