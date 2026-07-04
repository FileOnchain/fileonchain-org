# Deploy: Sui

Publishes the `fileonchain::file_registry` Move package from
`contracts/sui/`. Deploy to `sui:testnet` first, QA, then `sui:mainnet`.

## Prerequisites

- Sui CLI installed (`sui --version`).
- `sui move test` passing in `contracts/sui/`.

## Point the client at the network and fund the address

```bash
sui client switch --env testnet     # or: sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client active-address
sui client faucet                   # testnet only; mainnet needs real SUI
```

## Publish

```bash
cd contracts/sui
sui client publish --gas-budget 100000000
```

The output lists created objects. Capture the **package id** — the object
with `"type": "published"` (`packageId: 0x…`). That id is the module
address; anchors are `<packageId>::file_registry::anchor_cid(cid, payload)`
calls. Verify at `https://suiscan.xyz/testnet/object/<packageId>`.

Repeat on mainnet (`sui client switch --env mainnet`) once testnet QA
passes. Publishing mints a new package id per network — record each one on
its own chain entry.

Record the result in `packages/utils/src/chains.ts`: set `moduleAddress` to
the package id on the `sui:testnet` entry first, then `sui:mainnet`.
`isChainProvisioned` flips on from `moduleAddress`.

Fund the server signer: the keypair behind `ANCHOR_SUI_PRIVATE_KEY` (the
`suiprivkey…` bech32 export of an ed25519 key — `sui keytool export`) needs
SUI for gas on each network it serves.
