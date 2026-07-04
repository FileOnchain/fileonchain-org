# @fileonchain/api

Typed client for the hosted [FileOnChain](https://fileonchain.org) HTTP API.
Anchor CIDs with account credits (or a BYOK key) — FileOnChain's workers
sign the transactions, so no wallet or chain SDK is needed. Zero runtime
dependencies (global `fetch`, Node ≥ 18 or any browser).

```ts
import { FileOnChainClient, FileOnChainApiError } from "@fileonchain/api";

const client = new FileOnChainClient({
  apiKey: process.env.FILEONCHAIN_API_KEY!, // fok_… from /dashboard/keys
});

const job = await client.anchor({
  cid: "bafybeig...",
  fileName: "data.bin",
  fileSizeBytes: 150_000,
  chunkCount: 3,
  chainIds: ["substrate:autonomys-mainnet"],
  paymentMethod: "credits",
});
job.status;    // "complete" — anchoring runs within the request today
job.txHashes;  // one { chainId, txHash, blockNumber } per chain

await client.getJob(job.id);        // poll a job by id
await client.waitForJob(job.id);    // poll until complete/failed
await client.getCredits();          // { balanceMicroUsdc, balanceUsdc }
```

Errors surface as `FileOnChainApiError` with `.status` (401 bad key, 402
insufficient credits, 502 on-chain send failed — credits refunded) and the
server's `{ error }` body. For self-signed anchoring use the
`@fileonchain/sdk-<family>` clients instead.
