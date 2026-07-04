# @fileonchain/utils

The dependency-free FileOnChain core shared by every chain client:

- **`CHAINS`** — the chain registry, one `ChainConfig` per network across
  twelve families, including RPC endpoints, explorer URLs, and deployed
  contract addresses. The **single source of truth**; look up with
  `getChain(id)` / `getChainsByFamily(family)`.
- **CID validation** — `isValidCID`, `validateOrError` (CIDv1 base32).
- **Anchor payload vocabulary** — the versioned JSON payloads every family
  writes on-chain (`buildFileAnchorPayload`, `buildChunkAnchorPayload`,
  `parseAnchorPayload`), the provisioning seam (`isChainProvisioned`,
  `ChainNotProvisionedError`), and the uniform progress/receipt types.
- **Orchestration helpers** — `resolveFamilyChain`, `assertPayloadFits`,
  `batchByBytes` / `batchByCount`, `runSequentialChunkedAnchor` — the
  machinery the `@fileonchain/sdk-*` family clients are built on.

```ts
import { getChain, isValidCID, parseAnchorPayload } from "@fileonchain/utils";
```

Most applications want [`@fileonchain/sdk`](../sdk) (the umbrella) or a
single `@fileonchain/sdk-<family>` client instead; depend on this package
directly when you only need chain metadata, CID validation, or payload
parsing.
