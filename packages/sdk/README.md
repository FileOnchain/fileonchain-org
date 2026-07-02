# @fileonchain/sdk

Anchor file and folder CIDs on-chain with the FileOnChain contracts — without
going through the [fileonchain.org](https://fileonchain.org) frontend.

The SDK is the single source of truth for:

- **Supported networks** — `CHAINS`, one `ChainConfig` per network across four
  chain families (EVM, Substrate, Solana, Aptos), including RPC endpoints,
  explorer URLs, and the deployed contract addresses.
- **Contract ABIs** — `fileRegistryAbi`, `cachePaymentsAbi`,
  `donationEscrowAbi`, generated from the Foundry build output.
- **Chain clients** — thin, typed helpers to anchor and look up CIDs.

A folder anchors exactly like a file: compute the CID of the folder's DAG root
and anchor that CID.

## Install

```bash
pnpm add @fileonchain/sdk
# EVM chains additionally need:      pnpm add viem
# Substrate chains additionally need: pnpm add @polkadot/api
```

The core entry point (`@fileonchain/sdk`) is dependency-free. `viem` and
`@polkadot/api` are optional peer dependencies used only by the `./evm` and
`./substrate` subpaths.

## Networks and addresses

```ts
import { CHAINS, getChain, getChainsByFamily, buildTxUrl } from "@fileonchain/sdk";

const base = getChain("evm:8453");
base?.registryContract; // FileRegistry address on Base (null / zero until deployed)

getChainsByFamily("substrate").map((c) => c.name);
```

## Anchor on an EVM chain

```ts
import { anchorCID, getCIDRecord } from "@fileonchain/sdk/evm";
import { createWalletClient, custom } from "viem";

const walletClient = createWalletClient({
  account: "0x...",
  transport: custom(window.ethereum),
});

const txHash = await anchorCID(walletClient, {
  chainId: "evm:8453",
  cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  uri: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
});

// Later — anyone can verify without a wallet:
const record = await getCIDRecord("evm:8453", "bafybeig...");
record?.submitter;
```

## Anchor on a Substrate chain

Substrate anchors are `system.remarkWithEvent` extrinsics carrying a
versioned JSON payload (`buildAnchorRemark` / `parseAnchorRemark`), so any
indexer can find and verify them.

```ts
import { anchorCIDWithRemark } from "@fileonchain/sdk/substrate";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { getChain } from "@fileonchain/sdk";

const chain = getChain("substrate:autonomys-mainnet")!;
const api = await ApiPromise.create({ provider: new WsProvider(chain.rpcUrl) });

const receipt = await anchorCIDWithRemark(api, {
  chainId: "substrate:autonomys-mainnet",
  address: "5F...",
  signer: injectedSigner, // e.g. from @polkadot/extension-dapp
  cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
});
receipt.txHash;
```

Solana and Aptos are listed in the registry but have no deployed program /
module yet (`programId` / `moduleAddress` are `null`).

## Regenerating ABIs

The files under `src/abis/` are generated from the Foundry workspace. After
changing a contract:

```bash
cd contracts && forge build
node scripts/extract-abis.mjs   # from packages/sdk
```
