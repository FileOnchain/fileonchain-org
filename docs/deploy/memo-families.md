# Provision: memo families (Cosmos, TRON, Cardano, TON)

These four families anchor through a **native channel of the chain** — there
is nothing to deploy and nothing for them under `contracts/`. Provisioning
is a registry flip: `isChainProvisioned` returns true for them when
`memoAnchoring: true` is set on the chain entry (see
`packages/sdk/src/anchor.ts`).

Every family's **testnet entry already has `memoAnchoring: true`** in
`packages/sdk/src/chains.ts` (`cosmos:theta-testnet-001`, `tron:nile`,
`cardano:preprod`, `ton:testnet`). The runbook per family is:

1. Set the family's signer env vars (below) and fund the account on testnet.
2. QA on the testnet: run a credits upload, confirm the anchor payload is
   readable on the explorer and the dashboard links resolve.
3. Flip the switch on mainnet (see "Record the result" below).

## Cosmos

- **Carrier:** the transaction **memo** on a 1-unit self-send
  (`MsgSend` to the signer's own address).
- **Env:** `ANCHOR_COSMOS_MNEMONIC` — a BIP-39 mnemonic; the signer derives
  the `cosmos1…` address from it.
- **Funding:** a little ATOM per network for the self-send fees. Testnet
  tokens come from the Cosmos Hub testnet faucet (Discord); mainnet needs
  real ATOM.

## TRON

- **Carrier:** the `extra_data` field on a 1-SUN self-send, submitted via
  the TronGrid REST API (`api.trongrid.io` / `nile.trongrid.io`).
- **Env:** `ANCHOR_TRON_PRIVATE_KEY` — hex secp256k1 key.
- **Funding:** TRX for bandwidth/energy. Nile testnet TRX from
  https://nileex.io/join/getJoinPage; mainnet needs real TRX.
- Later, a TVM `FileRegistry` (the `contracts/evm/` Solidity compiles for
  TVM) can land in `moduleAddress` — `isChainProvisioned` accepts either.

## Cardano

- **Carrier:** transaction **metadata under CIP-20 label 674** on a
  minimal self-send, built and submitted through Blockfrost.
- **Env:** `ANCHOR_CARDANO_SIGNING_KEY` (the `cborHex` of a CLI payment
  signing key) **and** `ANCHOR_CARDANO_BLOCKFROST_KEY` (a Blockfrost
  project id matching the network — preprod key for `cardano:preprod`,
  mainnet key for `cardano:mainnet`).
- **Funding:** ADA above the min-UTxO plus fees. Preprod tADA from the
  Cardano testnet faucet; mainnet needs real ADA.

## TON

- **Carrier:** the **transfer comment** (text payload) on a minimal
  self-send from a wallet-v4 contract.
- **Env:** `ANCHOR_TON_MNEMONIC` (24-word wallet v4 mnemonic) plus the
  optional `ANCHOR_TON_API_KEY` (toncenter key — skips public rate limits;
  recommended in production).
- **Funding:** TON for fees, and the wallet contract must be deployed
  (send it a first incoming transfer). Testnet TON from the
  @testgiver_ton_bot faucet; mainnet needs real TON.

Record the result in `packages/sdk/src/chains.ts`: after testnet QA
passes, set `memoAnchoring: true` on the family's **mainnet** entry
(`cosmos:cosmoshub-4`, `tron:mainnet`, `cardano:mainnet`, `ton:mainnet`).
That flag is the provisioning switch — no address to record.

Fund the server signer: the accounts behind `ANCHOR_COSMOS_MNEMONIC`,
`ANCHOR_TRON_PRIVATE_KEY`, `ANCHOR_CARDANO_SIGNING_KEY` (+
`ANCHOR_CARDANO_BLOCKFROST_KEY` for submission), and `ANCHOR_TON_MNEMONIC`
(+ optional `ANCHOR_TON_API_KEY`) each need native tokens on every network
they serve — anchors are self-sends, so fees are the only spend.
