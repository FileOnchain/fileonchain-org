# Deploy: Aptos

Publishes the `fileonchain::file_registry` Move module from
`contracts/aptos/`. Deploy to `aptos:testnet` first, QA, then `aptos:mainnet`.

## Prerequisites

- Aptos CLI installed (`aptos --version`).
- `aptos move test` passing in `contracts/aptos/`.

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
`file_registry::anchor_cid(cid, payload)` calls. Verify on the explorer:
`https://explorer.aptoslabs.com/account/<account>/modules?network=testnet`.

Repeat with the mainnet profile once testnet QA passes.

Record the result in `packages/utils/src/chains.ts`: set `moduleAddress` to
the publishing account address on the `aptos:testnet` entry first, then
`aptos:mainnet` after the mainnet publish. `isChainProvisioned` flips on
from `moduleAddress`.

Fund the server signer: the account behind `ANCHOR_APTOS_PRIVATE_KEY` (hex
ed25519 key) needs APT for gas on each network it serves. It can be the
publishing account or a separate one — `anchor_cid` is permissionless.


## Anchor protocol (propose/verify)

The package now also publishes `fileonchain::foc_token` (the FOCAT Fungible
Asset, supply minted to the publisher) and `fileonchain::anchor_registry`
(proposals, staking, platforms, disputes — one escrow store with internal
ledgers; jury draws use Aptos native randomness). Both publish in the same
`aptos move publish` run; `init_module` registers FileOnChain as platform 1
with the publisher as admin and treasury.

After publishing, additionally set `tokenContract` on the chain entry to
the publishing account address — `isProposeProvisioned` gates the paid
file-anchor path on it. Then:

- fund the `ANCHOR_APTOS_PRIVATE_KEY` account with FOCAT (tips + bonds), not
  just APT gas (`foc_token::mint` is admin-gated for testnets)
- stake at least `jury_size` (5) validators (`anchor_registry::stake`,
  min 1000 FOCAT) so challenges can draw a jury
- the publisher account is the parameter admin — it executes EVM
  governance decisions (see docs/governance.md)


## Bridging & upgrades

Approve bridges with `foc_token::set_bridge(admin, bridge, true)`; bridges
mint arriving supply (`bridge_mint`) and burn departing supply from their
own store (`bridge_burn`). Publish with the default *compatible* upgrade
policy so the package stays upgradeable by the publisher account.
