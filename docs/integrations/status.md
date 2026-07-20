# Integration status

**Status: NON-NORMATIVE.** Network rollout is a product/deployment
concern and lives here, deliberately **outside** the
[Evidence Protocol specification](../protocol/evidence-protocol.md) —
the protocol has no chain fields and no opinion about which systems
exist. The single source of truth for this table is
[`packages/utils/src/chains.ts`](../../packages/utils/src/chains.ts)
(`integrationStatus` per network); when this document and the registry
disagree, the registry wins.

## The honest rule

Every network carries an explicit `integrationStatus` on this ladder
(each rung implies the ones before it):

> `designed` → `implemented` → `tested-locally` → `testnet-deployed` →
> `mainnet-deployed` → `webapp-integrated` → `production-ready` →
> `audited`

**No product surface, document, or marketing copy may describe a
network beyond its `integrationStatus`.** A network whose entry omits
the field is `implemented`: the family client exists in the SDK and
builds, but nothing is deployed or wired end-to-end for that specific
network. Families whose transport needs no deployment (Substrate
remarks, Solana Memo, memo/metadata/comment channels) skip the deploy
rungs — their integration is `webapp-integrated` once the client is
wired end-to-end.

## Roles: storage vs settlement

- **Storage system** — holds the subject bytes; chunk transactions
  embed data and the storage receipt carries a
  `fileonchain://<chainId>/<cid>` URI. Autonomys is the launch storage
  system (chunk data embedded by default); other storage-capable
  networks can carry bytes on request within their per-transaction
  budget.
- **Settlement system** — fixes a digest at a block and time; the
  envelope gets a settlement receipt per transaction. Receipts on
  several systems are **multi-system settlement receipts** —
  independent attestations, never a proof between systems.

## Launch set (last verified 2026-07-11)

| System | Role | Adapter package | `integrationStatus` | Last verified |
| --- | --- | --- | --- | --- |
| Autonomys Mainnet (`substrate:autonomys-mainnet`) | Storage + settlement (native remarks, chunk data embedded) | `@fileonchain/sdk-substrate` | `webapp-integrated` | 2026-07-11 |
| Autonomys Taurus (`substrate:autonomys-taurus`) | Storage + settlement (testnet) | `@fileonchain/sdk-substrate` | `webapp-integrated` | 2026-07-11 |
| Solana (`solana:mainnet`) | Settlement (native SPL Memo, no deployment) | `@fileonchain/sdk-solana` | `webapp-integrated` | 2026-07-11 |
| Solana Devnet (`solana:devnet`) | Settlement (testnet) | `@fileonchain/sdk-solana` | `webapp-integrated` | 2026-07-11 |
| Ethereum Sepolia (`evm:11155111`) | Settlement (anchor-only FileRegistry contract) | `@fileonchain/sdk-evm` | `testnet-deployed` | 2026-07-11 |
| Auto EVM Chronos (`evm:8700`) | Settlement (anchor-only FileRegistry contract, testnet) | `@fileonchain/sdk-evm` | `testnet-deployed` | 2026-07-11 |
| Auto EVM mainnet (`evm:870`) | Settlement target — flips when the Chronos-tested registry lands on the mainnet domain | `@fileonchain/sdk-evm` | `testnet-deployed` (mainnet pending) | 2026-07-11 |

## Roadmap adapters

SDK clients exist and build for every network below; nothing is
deployed or verified end-to-end for these specific networks, so none
may be described as live.

### EVM (`@fileonchain/sdk-evm`) — settlement via FileRegistry contract

| System | Role | `integrationStatus` | Last verified |
| --- | --- | --- | --- |
| Ethereum (`evm:1`) | Settlement | `implemented` | — |
| Base (`evm:8453`) | Settlement | `implemented` | — |
| Optimism (`evm:10`) | Settlement | `implemented` | — |
| Arbitrum One (`evm:42161`) | Settlement | `implemented` | — |
| Polygon (`evm:137`) | Settlement | `implemented` | — |
| BNB Smart Chain (`evm:56`) | Settlement | `implemented` | — |
| Avalanche C-Chain (`evm:43114`) | Settlement | `implemented` | — |
| zkSync Era (`evm:324`) | Settlement | `implemented` | — |
| Scroll (`evm:534352`) | Settlement | `implemented` | — |
| Linea (`evm:59144`) | Settlement | `implemented` | — |
| Mantle (`evm:5000`) | Settlement | `implemented` | — |
| Blast (`evm:81457`) | Settlement | `implemented` | — |
| Celo (`evm:42220`) | Settlement | `implemented` | — |
| Base Sepolia (`evm:84532`) | Settlement (testnet) | `implemented` | — |
| OP Sepolia (`evm:11155420`) | Settlement (testnet) | `implemented` | — |
| Arbitrum Sepolia (`evm:421614`) | Settlement (testnet) | `implemented` | — |
| Polygon Amoy (`evm:80002`) | Settlement (testnet) | `implemented` | — |
| BNB Smart Chain Testnet (`evm:97`) | Settlement (testnet) | `implemented` | — |
| Avalanche Fuji (`evm:43113`) | Settlement (testnet) | `implemented` | — |
| zkSync Sepolia (`evm:300`) | Settlement (testnet) | `implemented` | — |
| Scroll Sepolia (`evm:534351`) | Settlement (testnet) | `implemented` | — |
| Linea Sepolia (`evm:59141`) | Settlement (testnet) | `implemented` | — |
| Mantle Sepolia (`evm:5003`) | Settlement (testnet) | `implemented` | — |
| Blast Sepolia (`evm:168587`) | Settlement (testnet) | `implemented` | — |
| Celo Alfajores (`evm:44787`) | Settlement (testnet) | `implemented` | — |

### Substrate (`@fileonchain/sdk-substrate`) — settlement via `system.remarkWithEvent`

| System | Role | `integrationStatus` | Last verified |
| --- | --- | --- | --- |
| Polkadot Asset Hub (`substrate:polkadot-asset-hub`) | Settlement | `implemented` | — |
| Kusama Asset Hub (`substrate:kusama-asset-hub`) | Settlement | `implemented` | — |
| Westend Asset Hub (`substrate:westend-asset-hub`) | Settlement (testnet) | `implemented` | — |
| Paseo Asset Hub (`substrate:paseo-asset-hub`) | Settlement (testnet) | `implemented` | — |

### Other families

| System | Role | Adapter package | `integrationStatus` | Last verified |
| --- | --- | --- | --- | --- |
| Aptos (`aptos:mainnet`) | Settlement (Move module) | `@fileonchain/sdk-aptos` | `implemented` | — |
| Aptos Testnet (`aptos:testnet`) | Settlement (testnet) | `@fileonchain/sdk-aptos` | `implemented` | — |
| Cosmos Hub (`cosmos:cosmoshub-4`) | Settlement (tx memo) | `@fileonchain/sdk-cosmos` | `implemented` | — |
| Cosmos Hub Testnet (`cosmos:theta-testnet-001`) | Settlement (tx memo, testnet) | `@fileonchain/sdk-cosmos` | `implemented` | — |
| Sui (`sui:mainnet`) | Settlement (Move module, PTB-batched) | `@fileonchain/sdk-sui` | `implemented` | — |
| Sui Testnet (`sui:testnet`) | Settlement (testnet) | `@fileonchain/sdk-sui` | `implemented` | — |
| Starknet (`starknet:mainnet`) | Settlement (Cairo contract, multicall) | `@fileonchain/sdk-starknet` | `implemented` | — |
| Starknet Sepolia (`starknet:sepolia`) | Settlement (testnet) | `@fileonchain/sdk-starknet` | `implemented` | — |
| NEAR (`near:mainnet`) | Settlement (contract account) | `@fileonchain/sdk-near` | `implemented` | — |
| NEAR Testnet (`near:testnet`) | Settlement (testnet) | `@fileonchain/sdk-near` | `implemented` | — |
| TRON (`tron:mainnet`) | Settlement (memo) | `@fileonchain/sdk-tron` | `implemented` | — |
| TRON Nile (`tron:nile`) | Settlement (memo, testnet) | `@fileonchain/sdk-tron` | `implemented` | — |
| Cardano (`cardano:mainnet`) | Settlement (tx metadata) | `@fileonchain/sdk-cardano` | `implemented` | — |
| Cardano Preprod (`cardano:preprod`) | Settlement (tx metadata, testnet) | `@fileonchain/sdk-cardano` | `implemented` | — |
| TON (`ton:mainnet`) | Settlement (transfer comment) | `@fileonchain/sdk-ton` | `implemented` | — |
| TON Testnet (`ton:testnet`) | Settlement (transfer comment, testnet) | `@fileonchain/sdk-ton` | `implemented` | — |
| Hedera (`hedera:mainnet`) | Settlement (HCS topic) | `@fileonchain/sdk-hedera` | `implemented` | — |
| Hedera Testnet (`hedera:testnet`) | Settlement (testnet) | `@fileonchain/sdk-hedera` | `implemented` | — |

## Updating this table

1. Change `integrationStatus` on the network's entry in
   `packages/utils/src/chains.ts` (never here first).
2. Update the corresponding row and its "Last verified" date with the
   date the rung was actually exercised end-to-end.
3. Product surfaces read the registry, not this file — this document
   is the human-readable mirror.
