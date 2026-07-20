# Deploy: Aptos

Publishes the `fileonchain::file_registry` Move module from
`contracts/aptos/`. Deploy to `aptos:testnet` first, QA, then `aptos:mainnet`.

## Prerequisites

- Aptos CLI installed (`aptos --version`).
- `aptos move test --dev` passing in `contracts/aptos/`.

## Set up a profile and fund it

```bash
cd contracts/aptos
aptos init --profile fileonchain-testnet --network testnet
aptos account fund-with-faucet --profile fileonchain-testnet
```

For mainnet, `aptos init --profile fileonchain-mainnet --network mainnet`
and fund the account with real APT (there is no faucet).

## Publish

The module binds `fileonchain` at compile time (`Move.toml` has
`fileonchain = "_"`). Pass the profile's account address:

```bash
ACCOUNT=$(aptos config show-profiles --profile fileonchain-testnet \
  | grep account | awk '{print $2}')
aptos move publish \
  --profile fileonchain-testnet \
  --named-addresses fileonchain=$ACCOUNT
```

The module lands at `<account>::file_registry`; anchors are
`file_registry::anchor_cid(cid, payload)` calls — free beyond gas and
permissionless. Publish with the default *compatible* upgrade policy so the
package stays upgradeable by the publisher account. Verify on the explorer:
`https://explorer.aptoslabs.com/account/<account>/modules?network=testnet`.

Repeat with the mainnet profile once testnet QA passes.

Record the result in `packages/utils/src/chains.ts`: set `moduleAddress` to
the publishing account address on the `aptos:testnet` entry first, then
`aptos:mainnet` after the mainnet publish. `isChainProvisioned` flips on
from `moduleAddress`. Set the entry's `integrationStatus` to match reality
(`"testnet-deployed"`, then `"mainnet-deployed"`) — never above what is
actually deployed and verified.

Fund the server signer: the account behind `ANCHOR_APTOS_PRIVATE_KEY` (hex
ed25519 key) needs APT for gas on each network it serves. It can be the
publishing account or a separate one — `anchor_cid` is permissionless.
