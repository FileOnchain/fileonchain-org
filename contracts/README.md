# FileOnChain contracts

On-chain anchoring artifacts, organized **one directory per runtime**. Every
artifact writes the same `fileonchain` v1 JSON payload (see
`packages/utils/src/anchor.ts`) — only the transaction envelope differs.

| Directory | Runtime | Toolchain | Artifact |
| --- | --- | --- | --- |
| `evm/` | EVM (Ethereum, Base, BSC, …) | Foundry | `FileRegistry`, `CachePayments`, `DonationEscrow` (Solidity) |
| `aptos/` | Aptos | Aptos CLI (Move) | `file_registry::anchor_cid` module |
| `sui/` | Sui | Sui CLI (Move) | `file_registry::anchor_cid` module |
| `starknet/` | Starknet | Scarb (Cairo) | `FileRegistry` contract |
| `near/` | NEAR | cargo-near (Rust) | `anchor_cid` contract |

Families with **no artifact to deploy** anchor through a native channel and
have nothing here: Solana (SPL Memo program), Cosmos (tx memo), TRON (the
`evm/` Solidity compiles for TVM — deploy `FileRegistry` with TronIDE/tronbox
when moving past memo mode), Cardano (tx metadata), TON (transfer comment),
Hedera (HCS topic — create one with the runbook and set `hcsTopicId`).

Per-runtime deploy runbooks live in [`docs/deploy/`](../docs/deploy/). After
deploying anything, record the address/account/topic on the chain's entry in
`packages/utils/src/chains.ts` — that registry is the single source of truth,
and `isChainProvisioned` flips real anchoring on from those fields alone.

## EVM (`evm/`)

```bash
cd evm
forge install        # forge-std
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

```bash
cd near
cargo near build
cargo test
```
