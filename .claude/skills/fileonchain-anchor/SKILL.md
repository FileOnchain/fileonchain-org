---
name: fileonchain-anchor
description: Anchor a CID on FileOnChain — choose between the hosted API (@fileonchain/api or the MCP anchor_cid tool) and the direct @fileonchain/sdk-* family clients, handle payment, job polling, and provisioning fallbacks.
---

# Anchoring a CID on FileOnChain

Two ways to anchor, picked by who signs:

1. **Hosted API** — you hold a dashboard API key (`fok_…`); FileOnChain's
   workers sign and you pay with account credits (or a BYOK key). Use
   `@fileonchain/api` (or the MCP `anchor_cid` tool).
2. **Direct SDK** — you hold the wallet/signer; use a
   `@fileonchain/sdk-<family>` client (or its `@fileonchain/sdk/<family>`
   umbrella subpath) and pay gas yourself.

## Hosted API

```ts
import { FileOnChainClient, FileOnChainApiError } from "@fileonchain/api";

const client = new FileOnChainClient({ apiKey: process.env.FILEONCHAIN_API_KEY! });
const job = await client.anchor({
  cid: "bafy…",                       // CIDv1 base32 (folder = its DAG root CID)
  fileName: "data.bin",
  fileSizeBytes: 150_000,
  chunkCount: 3,                       // 1–100000
  chainIds: ["substrate:autonomys-mainnet"],
  paymentMethod: "credits",           // or "byok" + byokKeyId
});
// Anchoring runs inside the request: a 200 means job.status === "complete"
// and job.txHashes has one {chainId, txHash, blockNumber} per chain.
```

Errors are `FileOnChainApiError` with `.status`: 401 bad key, 402
insufficient credits (top up at /dashboard/credits), 404/409 BYOK key
problems, 502 send failed (credits auto-refunded). If jobs ever become
async, `client.waitForJob(job.id)` polls until complete/failed.

Via MCP instead: the `fileonchain` server's `anchor_cid`, `get_anchor_job`,
`get_credits` tools (needs `FILEONCHAIN_API_KEY` in the server env — see
`packages/mcp/README.md`).

## Direct SDK

Every family package exports `anchorChunkedFile` with the same
progress/receipt shape, plus a file-level `anchorCID*`. EVM/Substrate/Solana
take real chain SDK handles (viem WalletClient, ApiPromise,
Connection); the other nine take a minimal structural signer you adapt to
your wallet (see each package's `<Family>AnchorSigner` interface).

```ts
import { anchorChunkedFile } from "@fileonchain/sdk-cosmos"; // or "@fileonchain/sdk/cosmos"

const receipt = await anchorChunkedFile(signer, {
  chainId: "cosmos:cosmoshub-4",
  fileCid,
  chunks,                              // [{cid, index, nextCid?, data?}]
  onProgress: (p) => console.log(p.stage, p.chunksAnchored, "/", p.chunksTotal),
});
// receipt: { chainId, txHashes, txHash, blockNumber?, blockHash?, submitter }
```

Rules the SDK enforces (don't work around them):
- Chunk payloads are anchored first, the file-level payload **last** —
  indexers rely on that ordering.
- `ChainNotProvisionedError` means the chain has no deployed
  registry/module/topic (or its memo-anchoring flag is off). Catch it to
  fall back to a simulated flow — that is exactly what the webapp's
  `useFileUploader` does via `apps/web/src/lib/mock/upload.ts`.
- Memo/comment/message families size-check every payload before the first
  signature; don't pre-truncate payloads yourself.

## Where things live

- Payload format + helpers: `packages/utils/src/anchor.ts` and `helpers.ts`.
- Family clients: `packages/sdk-<family>/src/index.ts`.
- Server-side anchoring (webapp): `apps/web/src/lib/server/anchor-worker.ts`
  (needs the chain provisioned **and** its `ANCHOR_*` signer env vars set —
  documented in `apps/web/.env.example`).
