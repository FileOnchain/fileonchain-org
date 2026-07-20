# @fileonchain/protocol

The **FileOnChain Evidence Protocol** reference implementation core —
neutral and dependency-free: subject descriptors, namespaced claims,
context-bound artifact and envelope signatures, tagged adapter receipts,
deterministic canonical JSON, envelope digests, Merkle inclusion,
structural validation, and migration from the legacy format.

No AI semantics (that's [`@fileonchain/agent-profile`](../agent-profile)),
no chain registry, no hosted-product code. The normative specification is
[docs/protocol/evidence-protocol.md](../../docs/protocol/evidence-protocol.md);
conformance fixtures live in [`fixtures/`](./fixtures).

## Install

```bash
pnpm add @fileonchain/protocol
```

## Usage

```ts
import {
  buildEnvelope,
  computeEnvelopeDigest,
  finalizeEnvelope,
  artifactSigningPayload,
  sha256Hex,
} from "@fileonchain/protocol";

// An evidence envelope about any subject — here, a release tarball.
const envelope = buildEnvelope({
  subject: {
    type: "artifact",
    digests: { sha256: sha256Hex(tarballBytes) },
    size: tarballBytes.length,
    name: "myapp-1.4.0.tgz",
    mediaType: "application/gzip",
  },
  claims: {
    "org.example.release": { version: "1.4.0", commit: "9f2c1ab" },
  },
}); // finalized: carries envelope.digest.sha256

// What an artifact signer would sign (binds protocol, purpose,
// profile, subject, claims, and scope — replay-proof by construction):
const payload = artifactSigningPayload({ subject: envelope.subject, claims: envelope.claims });

// Tamper check after adding receipts:
computeEnvelopeDigest(envelope) === envelope.envelope!.digest.sha256;
```

Legacy `{ "p": "fileonchain-evidence", "v": 1 }` packages convert with
`migrateLegacyEvidence` (original signatures are preserved as legacy
records, never as protocol signatures). Verification lives in
[`@fileonchain/verify`](../verify).
