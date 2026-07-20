# FileOnChain contracts

On-chain anchoring artifacts, organized **one directory per runtime**. Every
artifact writes the same `fileonchain` v1 JSON payload (see
`packages/utils/src/anchor.ts`) — only the transaction envelope differs.

The suite is **anchor-only and deliberately economic-free**: anchoring costs
nothing beyond gas — no token, no tips, no bonds, no challenge windows. What
an anchor proves is exactly what the chain proves — that this payload was
written by this address in this block — and independent verification happens
off-chain against the transaction receipt and the payload vocabulary (the
FileOnChain evidence-package spec). The earlier verification-market contracts
(FOCAT token, propose/verify, staking, governance) live on the archive branch
`archive/focat-verification-market`.

| Directory | Runtime | Toolchain | Artifacts |
| --- | --- | --- | --- |
| `evm/` | EVM (Ethereum, Base, BSC, …) | Foundry | `FileRegistry` (event anchors + first-write CID record), `CachePayments`, `DonationEscrow`, `mocks/MockUSDC` (testnets) |
| `aptos/` | Aptos | Aptos CLI (Move) | `file_registry` (event-only `anchor_cid`) |
| `sui/` | Sui | Sui CLI (Move) | `file_registry` (event-only `anchor_cid`) |
| `starknet/` | Starknet | Scarb (Cairo) | `FileRegistry` (event-only `anchor_cid`) |
| `near/` | NEAR | cargo (Rust) | `registry/` (`anchor_cid` NEP-297 event emitter) |

Families with **no artifact to deploy** anchor through a native channel and
have nothing here: Solana (SPL Memo program), Cosmos (tx memo), TRON (the
`evm/` Solidity compiles for TVM — deploy `FileRegistry` with TronIDE/tronbox
when moving past memo mode), Cardano (tx metadata), TON (transfer comment),
Hedera (HCS topic — create one with the runbook and set `hcsTopicId`).

Per-runtime deploy runbooks live in [`docs/deploy/`](../docs/deploy/). After
deploying anything, record the address/account/topic on the chain's entry in
`packages/utils/src/chains.ts` — that registry is the single source of truth,
and `isChainProvisioned` flips real anchoring on from those fields alone.
Update the entry's `integrationStatus` at the same time, honestly.

## Coverage

Tests target **≥95% coverage** on every contract (the event-only anchoring
modules are single-function and sit at 100%). Measure with:

```bash
cd evm && forge coverage                 # per-file lines/branches/funcs
cd aptos && aptos move test --coverage --dev
cd sui && sui move test --coverage && sui move coverage summary
cd near && cargo test -p fileonchain-registry
cd starknet && scarb test                # cairo-test has no coverage tool yet
```

## EVM (`evm/`)

`FileRegistry` (initializer-style, `initialize(address owner)`) has two write
paths: `anchorChunk` is pure event emission, `anchorCID` emits plus stores a
first-write-wins record readable via `getCIDRecord` / `isCIDAnchored`.
`script/Deploy.s.sol` deploys it with `CachePayments` and `DonationEscrow`
behind OZ transparent proxies (and a `MockUSDC` on testnets when
`USDC_ADDRESS` is unset).

```bash
cd evm
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.4.0 OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0  # lib/ is untracked
forge build
forge test
```

After changing a contract, regenerate the SDK ABIs:
`cd packages/sdk-evm && node scripts/extract-abis.mjs`.

## Aptos (`aptos/`)

```bash
cd aptos
aptos move compile --named-addresses fileonchain=<account>
aptos move test --dev
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

A cargo workspace with a single contract, `registry/`
(`fileonchain-registry`) — a stateless `anchor_cid` event emitter,
initialized with the no-arg `new()`.

```bash
cd near
cargo near build   # run inside registry/
cargo test -p fileonchain-registry
```
