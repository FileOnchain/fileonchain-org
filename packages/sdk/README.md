# @fileonchain/sdk

The **reference SDK** for FileOnChain: create evidence envelopes, seal
agent runs, and anchor file and folder CIDs on-chain — without going
through the [fileonchain.org](https://fileonchain.org) frontend.

The SDK is the single source of truth for:

- **Supported networks** — `CHAINS`, one `ChainConfig` per network across
  twelve chain families (EVM, Substrate, Solana, Aptos, Cosmos, Sui,
  Starknet, NEAR, TRON, Cardano, TON, Hedera), including RPC endpoints,
  explorer URLs, and the deployed contract addresses.
- **Contract ABIs** — `fileRegistryAbi`, `cachePaymentsAbi`,
  `donationEscrowAbi`, generated from the Foundry build output.
- **Chain clients** — thin, typed helpers to anchor and look up CIDs.

A folder anchors exactly like a file: compute the CID of the folder's DAG root
and anchor that CID.

This package is an **umbrella**: the root entry re-exports
[`@fileonchain/utils`](../utils) (plus the EVM ABIs), `./protocol`
re-exports [`@fileonchain/protocol`](../protocol) (the Evidence Protocol
core), `./agent-profile` re-exports
[`@fileonchain/agent-profile`](../agent-profile), `./evidence` is the
high-level evidence experience (`createEvidence`, `sealAgentRun`, receipt
helpers, `signEnvelope`), each `./​<family>` subpath re-exports the
standalone `@fileonchain/sdk-<family>` package, and `./api` re-exports
[`@fileonchain/api`](../api), the client for FileOnChain Cloud's hosted
HTTP API. Depend on the individual packages instead when you want the
smallest possible install.

## Install

```bash
pnpm add @fileonchain/sdk
# EVM chains additionally need:       pnpm add viem
# Substrate chains additionally need: pnpm add @polkadot/api
# Solana chains additionally need:    pnpm add @solana/web3.js
```

The core entry point (`@fileonchain/sdk`) is dependency-free. `viem`,
`@polkadot/api`, and `@solana/web3.js` are optional peer dependencies used
only by the `./evm`, `./substrate`, and `./solana` subpaths. Every other
family subpath (`./aptos`, `./cosmos`, `./sui`, `./starknet`, `./near`,
`./tron`, `./cardano`, `./ton`, `./hedera`) is dependency-free: the SDK
builds payloads, batches, and progress, and a minimal structural signer
interface owns transport — adapt a wallet provider (browser) or the chain's
own SDK (server) to it.

## Seal evidence (`./evidence`)

`@fileonchain/sdk/evidence` is the high-level way to produce protocol
evidence envelopes — including Agent Evidence Profile envelopes via
`sealAgentRun`:

```ts
import {
  sealAgentRun,
  settlementReceiptFromAnchor,
  signEnvelope,
} from "@fileonchain/sdk/evidence";
import { finalizeEnvelope } from "@fileonchain/sdk/protocol";

// Seal an agent run: subject derived from bytes, profile
// "org.fileonchain.agent/v1" stamped and bound into every signature.
let envelope = await sealAgentRun({
  subjectBytes: reportBytes,
  subjectMeta: { name: "report.md", mediaType: "text/markdown" },
  run: {
    runId: "run_42",
    agentId: "agent_reporter",
    status: "completed",
    model: { provider: "anthropic", id: "claude-fable-5" },
  },
  signers: [agentSigner], // EvidenceSigner: { signer, sign(payload) }
});

// Attach a settlement receipt from an anchor send, re-finalize (the
// envelope digest must cover the new receipt), then envelope-sign the
// assembled whole:
envelope = finalizeEnvelope({
  ...envelope,
  receipts: {
    ...envelope.receipts,
    settlement: [settlementReceiptFromAnchor({ chainId: "evm:11155111", txHash })],
  },
});
envelope = await signEnvelope(envelope, [operatorSigner]);
```

`createEvidence` does the same for any subject without the agent
profile; `subjectFromBytes`, `signArtifact`, and `storageReceipt` are
the underlying building blocks. Verify the result with
[`@fileonchain/verify`](../verify) (`fileonchain verify`).

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

## Anchor through the hosted API

With a dashboard API key (`fok_…`), `@fileonchain/sdk/api` anchors without
any wallet — FileOnChain's workers sign and account credits pay:

```ts
import { FileOnChainClient } from "@fileonchain/sdk/api";

const client = new FileOnChainClient({ apiKey: process.env.FILEONCHAIN_API_KEY! });
const job = await client.anchor({
  cid: "bafybeig...",
  fileName: "data.bin",
  fileSizeBytes: 150_000,
  chunkCount: 3,
  chainIds: ["substrate:autonomys-mainnet"],
  paymentMethod: "credits",
});
job.txHashes; // one { chainId, txHash, blockNumber } per chain
```

## Regenerating ABIs

The ABIs live in `@fileonchain/sdk-evm` (`packages/sdk-evm/src/abis/`) and
are generated from the Foundry workspace. After changing a contract:

```bash
cd contracts/evm && forge build
cd packages/sdk-evm && node scripts/extract-abis.mjs
```
