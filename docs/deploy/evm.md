# Deploy: EVM chains

Deploys the anchor-protocol suite — `FileOnChainAttestationToken`, `FileOnChainTimelock`,
`FileOnChainGovernor`, `ValidatorStaking`, `PlatformRegistry`, `FileRegistry` —
plus `CachePayments` / `DonationEscrow` from `contracts/evm/` with Foundry's
`script/Deploy.s.sol`. One run per chain.

The script wires governance completely: the governor becomes the timelock's
only proposer, every protocol contract's owner becomes the timelock (which is
also the protocol treasury), FileOnChain is registered as platform id 1, and
the deployer's timelock admin role is renounced. After a run, protocol
parameters change only through governance proposals.

## Prerequisites

- Foundry installed (`forge --version`); in `contracts/evm/` run
  `forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.4.0 OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0`
  (`lib/` is untracked).
- A funded deployer key on the target chain.
- An explorer API key if you pass `--verify` (Etherscan-family).

## Environment

```bash
export PRIVATE_KEY=0x...                # deployer key (required)
export TREASURY_ADDRESS=0x...           # CachePayments/DonationEscrow treasury (required)
export PLATFORM_TREASURY_ADDRESS=0x...  # FileOnChain platform-fee treasury (optional, default: TREASURY_ADDRESS)
export TOKEN_INITIAL_SUPPLY=...         # FOCAT minted to deployer (optional, default 1e27 = 1B FOCAT)
export TIMELOCK_MIN_DELAY=...           # seconds (optional, default 172800 = 2 days)
export GOVERNOR_VOTING_DELAY=...        # blocks (optional, default 7200 ≈ 1 day)
export GOVERNOR_VOTING_PERIOD=...       # blocks (optional, default 50400 ≈ 1 week)
export GOVERNOR_PROPOSAL_THRESHOLD=...  # FOCAT base units (optional, default 100k FOCAT)
export USDC_ADDRESS=0x...               # the chain's canonical USDC (optional)
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
`FileOnChainAttestationToken`, `FileOnChainTimelock`, `FileOnChainGovernor`,
`ValidatorStaking`, `PlatformRegistry`, `FileRegistry`, `MockUSDC`
(testnets only), `CachePayments`, `DonationEscrow`.

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

**zkSync Era (324 / 300):** vanilla Foundry cannot broadcast to zkEVM. Use
[foundry-zksync](https://github.com/matter-labs/foundry-zksync)
(`forge script ... --zksync`) or zkSync's own tooling; the Solidity itself
needs no changes.

**Jury randomness caveat:** dispute juries are drawn from
`block.prevrandao` + the parent blockhash. On Ethereum L1 that is beacon
randomness; on OP-stack chains (Base, Blast, ...) it is sequencer-derived and
on Arbitrum it is a constant — the sequencer can influence jury selection
there. Accepted v1 limitation; a VRF draw is the documented follow-up.

## After deploying

If the contracts changed since the last deploy, regenerate the SDK ABIs:

```bash
cd packages/sdk-evm && node scripts/extract-abis.mjs
```

Then run `pnpm build` from the repo root and confirm it is green.

Record the result in `packages/utils/src/chains.ts` on the chain's
`evm:<chainId>` entry: set `registryContract` plus the new protocol fields —
`tokenContract`, `stakingContract`, `platformRegistryContract`,
`governorContract`, `timelockContract` (and `cacheContract` /
`donationContract` if you deployed them), replacing `ZERO_ADDRESS`.
`isChainProvisioned` flips on from `registryContract` alone; the propose
path additionally needs `tokenContract` (see `isProposeProvisioned`).

Fund the server signer: the account behind `ANCHOR_EVM_PRIVATE_KEY` needs
native gas on every EVM chain it serves, **and FOCAT** for tips and propose
bonds (plus a one-time ERC-20 approval to the registry, which the SDK
handles automatically on first propose).

Bootstrap the validator set: challenges revert while fewer than `jurySize`
(default 5) validators are staked. Stake FileOnChain-operated validators
(`ValidatorStaking.stake`, min 1000 FOCAT each) right after deploying.


## Proxies, bridges, remote chains

Every protocol contract deploys behind a TransparentUpgradeableProxy; the
script logs **proxy and implementation** addresses — record the *proxy*
addresses in `chains.ts` (they never change across upgrades). Each proxy's
ProxyAdmin is owned by the timelock: upgrades are governance proposals
calling `ProxyAdmin.upgradeAndCall`.

On every chain except the home chain, set `TOKEN_INITIAL_SUPPLY=0` — FOCAT
arrives through bridges only. To connect a bridge, governance proposes
`token.setBridgeLimits(bridge, mintLimit, burnLimit)`; limits replenish
linearly over one day and are the per-bridge blast-radius cap.
