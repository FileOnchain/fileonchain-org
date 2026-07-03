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
# EVM chains additionally need:       pnpm add viem
# Substrate chains additionally need: pnpm add @polkadot/api
# Solana chains additionally need:    pnpm add @solana/web3.js
```

The core entry point (`@fileonchain/sdk`) is dependency-free. `viem`,
`@polkadot/api`, and `@solana/web3.js` are optional peer dependencies used
only by the `./evm`, `./substrate`, and `./solana` subpaths; `./aptos` is
dependency-free (it drives the injected wallet provider).

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

## Anchor a chunked file (any family)

Every family client exports `anchorChunkedFile`, which anchors each chunk
plus a file-level anchor and reports uniform progress. All four write the
same versioned JSON payloads (`buildFileAnchorPayload` /
`buildChunkAnchorPayload` from the core entry) — as Substrate remarks
(chunk bytes included, batched with `utility.batchAll`), EVM registry
`uri`s, Solana SPL Memo instructions, or Aptos module arguments — so one
indexer can parse anchors from every chain.

```ts
import { anchorChunkedFile } from "@fileonchain/sdk/substrate";

const receipt = await anchorChunkedFile(api, {
  chainId: "substrate:autonomys-mainnet",
  address: "5F...",
  signer: injectedSigner,
  fileCid: "bafybeig...",
  chunks: [{ cid: "bafk...", index: 0, nextCid: undefined, data: bytes }],
  onProgress: ({ stage, chunksAnchored, chunksTotal }) => { /* UI */ },
});
receipt.txHashes; // every transaction sent
receipt.txHash;   // the file-level anchor
```

Chains with nothing deployed throw `ChainNotProvisionedError` (exported from
the core entry, check with `isChainProvisioned(chain)`), so callers can fall
back gracefully. Solana needs no deployment — anchors ride the native SPL
Memo program. Aptos stays unprovisioned until `moduleAddress` lands in the
registry.

## Regenerating ABIs

The files under `src/abis/` are generated from the Foundry workspace. After
changing a contract:

```bash
cd contracts && forge build
node scripts/extract-abis.mjs   # from packages/sdk
```
