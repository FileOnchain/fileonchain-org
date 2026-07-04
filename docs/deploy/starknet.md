# Deploy: Starknet

Declares and deploys the Cairo `FileRegistry` from `contracts/starknet/`.
Deploy to `starknet:sepolia` first, QA, then `starknet:mainnet`.

Starknet accounts are contracts: before anything below, you need a
**deployed** account (Argent/Braavos export, or `starkli account deploy`) —
a bare keypair cannot sign.

## Prerequisites

- Scarb installed (`scarb --version`); `scarb test` passing in `contracts/starknet/`.
- starkli (or sncast) with a keystore + account descriptor for the deployer.

## Build

```bash
cd contracts/starknet
scarb build
```

Outputs land in `target/dev/` — the contract class is
`fileonchain_FileRegistry.contract_class.json`.

## Declare, then deploy (starkli)

```bash
export STARKNET_RPC=https://starknet-sepolia.public.blastapi.io/rpc/v0_7
export STARKNET_ACCOUNT=~/.starkli/account.json
export STARKNET_KEYSTORE=~/.starkli/keystore.json

starkli declare target/dev/fileonchain_FileRegistry.contract_class.json
# prints the class hash
starkli deploy <CLASS_HASH>
# prints the contract address — FileRegistry has no constructor args
```

Or with sncast: `sncast declare --contract-name FileRegistry` then
`sncast deploy --class-hash <CLASS_HASH>`.

Smoke-test with an anchor call and check the `CIDAnchored` event on
`https://sepolia.starkscan.co/contract/<address>`. Repeat against the
mainnet RPC (`packages/utils/src/chains.ts` has the URL) once QA passes.

Record the result in `packages/utils/src/chains.ts`: set `registryContract`
to the deployed contract address on the `starknet:sepolia` entry first,
then `starknet:mainnet`. `isChainProvisioned` flips on from
`registryContract`.

Fund the server signer: `ANCHOR_STARKNET_ACCOUNT` is the **deployed account
contract address** and `ANCHOR_STARKNET_PRIVATE_KEY` its signing key — both
are required, and the account must exist on-chain and hold STRK/ETH for
fees on each network it serves.
