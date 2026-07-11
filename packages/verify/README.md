# @fileonchain/verify

Deterministic local verification of FileOnChain **evidence packages** — the
most important component of the protocol: if this library says a package is
valid, you did not have to trust FileOnChain to know it.

```bash
fileonchain-verify evidence.json                     # offline checks
fileonchain-verify evidence.json --artifact report.pdf
fileonchain-verify evidence.json --artifact report.pdf --online
```

## What it checks

- **Schema & canonical encoding** — evidence-package version and structure.
- **Artifact hashes** — SHA-256 of the provided bytes against the package.
- **Signatures** — EIP-191 (EVM addresses) and ed25519 (agent/service
  keys), each over the canonical signing payload; reports signer identity,
  delegation (proven vs. merely claimed), and key status (unknown when the
  signer declared no key-status endpoint — a signature alone cannot prove
  non-revocation).
- **Merkle inclusion** — the artifact's digest proves into the anchored
  manifest root.
- **Storage receipts** — structural validity of `fileonchain://` and
  external URIs per storage mode.
- **Settlement receipts** — skipped offline (with an explorer link to check
  by hand); `--online` confirms EVM receipts against public RPC endpoints.

Offline checks are fully deterministic. `--online` never calls a
FileOnChain service — only public nodes of the settlement chains.

## Library

```ts
import { verifyEvidencePackage, verifyEvidenceJson } from "@fileonchain/verify";

const report = await verifyEvidencePackage(pkg, {
  artifactBytes,          // enables content-integrity checks
  checkSettlements: true, // online receipt confirmation (EVM in v1)
});
report.ok;      // no check failed
report.checks;  // [{ name, status: "pass"|"fail"|"skipped"|"unknown", detail }]
```

Exit codes (CLI): `0` no check failed · `1` at least one check failed ·
`2` usage or I/O error.

## What a passing report means

That specific bytes existed, are unchanged, were signed by specific keys,
and were anchored at specific times on specific systems. It does **not**
mean the content is true, legally valid, or factually accurate — and it
proves the key, not the person behind it.
