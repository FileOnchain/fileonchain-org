# FileOnChain contracts

On-chain anchoring artifacts, organized **one directory per runtime**. Every
artifact writes the same `fileonchain` v1 JSON payload (see
`packages/utils/src/anchor.ts`) — only the transaction envelope differs.

The five contract runtimes run the **optimistic anchor protocol**: chunk
anchors stay free event emitters, while file-level anchors are paid
proposals — `propose_anchor` escrows a FOCAT tip + bond, an unchallenged
proposal finalizes after a 24h window and the tip splits 60/25/15 between
staked validators, the originating platform, and the protocol treasury;
challenges go to a jury drawn from the staked validator set. Governance is
EVM-hubbed (Governor + timelock); the other runtimes mirror decisions via
admin accounts — see [`docs/governance.md`](../docs/governance.md).

| Directory | Runtime | Toolchain | Artifacts |
| --- | --- | --- | --- |
| `evm/` | EVM (Ethereum, Base, BSC, …) | Foundry | `FileRegistry` (propose/verify), `FileOnChainAttestationToken`, `ValidatorStaking`, `PlatformRegistry`, `FileOnChainGovernor` + `Timelock`, `CachePayments`, `DonationEscrow` |
| `aptos/` | Aptos | Aptos CLI (Move) | `foc_token` (Fungible Asset), `anchor_registry` (protocol), `file_registry` (free chunk anchors) |
| `sui/` | Sui | Sui CLI (Move) | `focat` (`Coin<FOCAT>`), `anchor_registry` (shared object), `file_registry` (free chunk anchors) |
| `starknet/` | Starknet | Scarb (Cairo) | `FocToken` (ERC-20), `AnchorRegistry` (protocol), `FileRegistry` (free chunk anchors) |
| `near/` | NEAR | cargo workspace (Rust) | `foc-token/` (NEP-141), `registry/` (protocol via `ft_transfer_call` + free `anchor_cid`) |

Families with **no artifact to deploy** anchor through a native channel and
have nothing here: Solana (SPL Memo program), Cosmos (tx memo), TRON (the
`evm/` Solidity compiles for TVM — deploy `FileRegistry` with TronIDE/tronbox
when moving past memo mode), Cardano (tx metadata), TON (transfer comment),
Hedera (HCS topic — create one with the runbook and set `hcsTopicId`).

Per-runtime deploy runbooks live in [`docs/deploy/`](../docs/deploy/). After
deploying anything, record the address/account/topic on the chain's entry in
`packages/utils/src/chains.ts` — that registry is the single source of truth,
and `isChainProvisioned` flips real anchoring on from those fields alone.

## Coverage

Tests target **≥95% coverage** on every contract (the anchoring-only
runtimes are single-function and sit at 100%). Measure with:

```bash
cd evm && forge coverage                 # per-file lines/branches/funcs
cd aptos && aptos move test --coverage --dev
cd sui && sui move test --coverage && sui move coverage summary
cd near && cargo test                    # workspace unit tests (registry + foc-token)
cd starknet && scarb test                # cairo-test has no coverage tool yet
```

## EVM (`evm/`)

```bash
cd evm
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.4.0  # lib/ is untracked
forge build
forge test
```

After changing a contract, regenerate the SDK ABIs:
`cd packages/sdk-evm && node scripts/extract-abis.mjs`.

## Aptos (`aptos/`)

```bash
cd aptos
aptos move compile --named-addresses fileonchain=<account>
aptos move test
```

## Sui (`sui/`)

```bash
cd sui
sui move build
sui move test
```

## Starknet (`starknet/`)

```bash
cd starknet
scarb build
scarb test
```

## NEAR (`near/`)

A cargo workspace with two contracts — deploy `foc-token/` and `registry/`
to separate accounts, then `registry.new(token, protocol_treasury,
platform_treasury)`.

```bash
cd near
cargo near build   # run inside registry/ and foc-token/
cargo test
```
