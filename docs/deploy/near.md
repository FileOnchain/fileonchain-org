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


## Anchor protocol (propose/verify)

`contracts/near/` is now a two-contract cargo workspace. Deploy
`foc-token/` (NEP-141, `new(owner_id, total_supply)`) and `registry/`
(`new(token, protocol_treasury, platform_treasury)` — the deployer becomes
admin and platform 1) to separate accounts. NEAR has no allowances: every
paid action is `ft_transfer_call(registry, amount, msg)` on the token with
a JSON `msg` ({"action":"propose"|"challenge"|"stake"}); a panic in
`ft_on_transfer` refunds automatically. Payout recipients must be
storage-registered on the token (`storage_deposit`).

Record on the chain entry: `moduleAddress` = the registry account,
`tokenContract` = the token account. Fund `ANCHOR_NEAR_ACCOUNT_ID` with
FOCAT and storage-register it on the token; stake at least 5 validators.
The admin executes EVM governance decisions (see docs/governance.md).


## Bridging & upgrades

The token owner is the admin: approve bridges with `set_bridge`; bridges
`bridge_mint` arriving supply (receiver must be storage-registered) and
`bridge_burn` departing supply from their own balance. Deploy remote
chains with `total_supply = 0`. Upgrades are NEAR-native: redeploy the
wasm to the same account with its full-access key — state is preserved.
