---
name: fileonchain-chains
description: Look up or modify FileOnChain's supported chains — packages/utils/src/chains.ts is the single source of truth for networks, contract addresses, and provisioning flags; never hardcode chain data anywhere else.
---

# The FileOnChain chain registry

`packages/utils/src/chains.ts` (`@fileonchain/utils`) is the **single source
of truth** for every supported network across the twelve families (EVM,
Substrate, Solana, Aptos, Cosmos, Sui, Starknet, NEAR, TRON, Cardano, TON,
Hedera). To add or change a chain or record a deployed address, edit
`CHAINS` there — never sprinkle chain constants through webapp components.
The full chain-addition checklist is `docs/chains/checklist.md`; per-chain
deploy runbooks are under `docs/deploy/`.

## Reading the registry

```ts
import {
  CHAINS, getChain, getChainsByFamily, getVisibleChains,
  MAINNET_CHAINS, TESTNET_CHAINS, ACTIVE_CHAINS, DEFAULT_CHAIN_ID,
  buildTxUrl, buildAddressUrl, isChainProvisioned, isChainActive,
} from "@fileonchain/utils"; // or "@fileonchain/sdk"
```

- Chain ids are `"<family>:<name>"` (`evm:8453`,
  `evm:870` — Auto EVM, the default chain).
- Every entry carries a rollout `status`: `"active"` (open for uploads),
  `"planned"` (listed, not selectable; the anchoring API rejects it), or
  `"deprecated"` (reads only). `isChainActive` / `ACTIVE_CHAINS` gate
  upload surfaces; status is orthogonal to `isChainProvisioned`.
- Webapp pickers use `useVisibleChains()` (preference-driven testnet
  visibility); static marketing copy counts `MAINNET_CHAINS`.
- Explorer links always come from `buildTxUrl` / `buildAddressUrl`.

## Provisioning fields (what makes anchoring "real")

`isChainProvisioned(chain)` in `packages/utils/src/anchor.ts` reads, per
family:

| Family | Provisioned when |
| --- | --- |
| evm, starknet | `registryContract` set and not the zero address |
| substrate | `palletContract === "system.remarkWithEvent"` |
| solana | always (native SPL Memo program) |
| aptos, sui, near | `moduleAddress` set |
| cosmos, tron, cardano, ton | `memoAnchoring: true` (or a `moduleAddress`) |
| hedera | `hcsTopicId` set |

`memoAnchoring` is the deliberate on-switch for memo/metadata/comment
anchoring — true on those families' testnets, flipped on mainnets only
after QA. `embedsChunkData` marks chains whose anchors carry the chunk
bytes (Autonomys only). `bech32Prefix` is Cosmos-specific.

Unprovisioned chains throw `ChainNotProvisionedError` from the family
clients; callers fall back to the mock flow.

## MCP shortcuts

The `fileonchain` MCP server (`packages/mcp`) exposes `list_chains`,
`get_chain`, and `build_explorer_url` over the same registry.
