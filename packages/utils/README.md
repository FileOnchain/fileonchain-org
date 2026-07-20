# @fileonchain/utils

The dependency-free FileOnChain core shared by every chain client:

- **`CHAINS`** — the chain registry, one `ChainConfig` per network across
  twelve families, including RPC endpoints, explorer URLs, and deployed
  contract addresses. The **single source of truth**; look up with
  `getChain(id)` / `getChainsByFamily(family)`.
- **CID validation** — `isValidCID`, `validateOrError` (CIDv1 base32).
- **Evidence-package schema v1** — `buildEvidencePackage` /
  `validateEvidencePackage`, canonical JSON (`canonicalStringify`), signer
  identities and signatures, storage + settlement receipts — the core
  protocol spec shared by the SDK, API, MCP server, and webapp; validated
  locally by [`@fileonchain/verify`](../verify).
- **Manifests & Merkle batching** — `buildManifest` / `buildMerkleTree` /
  `verifyMerkleInclusion`: one settlement transaction anchors a whole
  workflow's artifacts with individual inclusion proofs.
- **`sha256`** — dependency-free synchronous SHA-256 (identical in
  browser/Node/edge) with hex helpers.
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
