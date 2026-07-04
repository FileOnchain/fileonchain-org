# Deploy: NEAR

Builds and deploys the `fileonchain-registry` contract from
`contracts/near/`. Deploy to `near:testnet` first, QA, then `near:mainnet`.

## Prerequisites

- Rust + cargo-near installed (`cargo near --version`).
- near CLI installed (`near --version`).
- `cargo test` passing in `contracts/near/`.

## Build

```bash
cd contracts/near
cargo near build
```

The reproducible WASM lands under `target/near/fileonchain_registry.wasm`.

## Create the contract account

The contract lives on its own named account (testnet accounts end in
`.testnet`, mainnet in `.near`):

```bash
near account create-account fund-myself fileonchain.testnet '5 NEAR' \
  autogenerate-new-keypair save-to-keychain \
  sign-as <your-funded-account>.testnet network-config testnet
```

On mainnet, create `fileonchain.near` the same way (a subaccount like
`registry.fileonchain.near` also works), funded with real NEAR.

## Deploy

```bash
near contract deploy fileonchain.testnet \
  use-file target/near/fileonchain_registry.wasm \
  without-init-call network-config testnet
```

Smoke-test:

```bash
near contract call-function as-transaction fileonchain.testnet anchor_cid \
  json-args '{"cid":"<a CIDv1>","payload":"<fileonchain v1 JSON>"}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as <your-account>.testnet network-config testnet
```

Check the tx on `https://testnet.nearblocks.io`. Repeat on
`network-config mainnet` once QA passes.

Record the result in `packages/utils/src/chains.ts`: set `moduleAddress` to
the contract **account id** (e.g. `fileonchain.testnet`, not a hash) on the
`near:testnet` entry first, then `near:mainnet`. `isChainProvisioned` flips
on from `moduleAddress`.

Fund the server signer: `ANCHOR_NEAR_ACCOUNT_ID` is a NEAR account id and
`ANCHOR_NEAR_PRIVATE_KEY` an `ed25519:…` full-access key for it — both are
required, and the account needs NEAR for gas on each network it serves. It
can be any account; `anchor_cid` is permissionless.
