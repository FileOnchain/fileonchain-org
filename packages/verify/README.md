# @fileonchain/verify

Deterministic local verification of FileOnChain evidence — the most
important component of the stack: if this library says an envelope
verifies, you did not have to trust FileOnChain to know it. Nothing here
ever calls a FileOnChain service.

Two formats are supported:

- **Protocol evidence envelopes** (`protocol: "fileonchain-evidence"`) —
  the current format, per the
  [Evidence Protocol specification](../../docs/protocol/evidence-protocol.md).
- **`legacy-evidence-v1` packages** (`p: "fileonchain-evidence"`) — the
  pre-separation format, verified as-is forever and convertible with
  `fileonchain migrate`.

## CLI

```bash
fileonchain verify evidence.json                          # offline, deterministic
fileonchain verify evidence.json --artifact report.pdf    # + subject byte check
fileonchain verify evidence.json --online                 # + receipt confirmation (public endpoints only)
fileonchain verify evidence.json --json                   # machine-readable report

fileonchain migrate legacy.json --output migrated.evidence.json
```

(`fileonchain-verify` is a compatibility alias that defaults to
`verify`.) Migration preserves original signatures as legacy records
only — they signed the old payload shape and are **not** valid protocol
artifact signatures.

## Result states

Every check carries a group, a status
(`pass | fail | warning | unknown | skipped`), and a detail. The overall
status never collapses uncertainty into one green light:

| Status | Meaning |
| --- | --- |
| `valid` | Every check passed. |
| `valid-with-warnings` | Nothing failed; at least one warning or unknown (e.g. undeclared key status, unregistered adapter or profile). |
| `incomplete` | Nothing failed, but essential parts are missing — e.g. a draft envelope with no envelope digest. |
| `invalid` | At least one check failed. |

Unknown adapters and unknown profiles are reported **unknown, never
failed** — their content is preserved, not rejected.

## What it checks

Schema → subject integrity (with bytes) → profile + claims → artifact
signatures (EIP-191 and ed25519, payload-digest context binding,
identity/delegation/key-status honesty) → envelope digest + envelope
signatures → receipts through their adapters. Built-in adapters:
`fileonchain-merkle/v1` (inclusion, pure),
`fileonchain-evm-anchor/v1` / `fileonchain-anchor/v1` (settlement;
`--online` confirms EVM receipts against public RPC — inclusion, not
finality), `fileonchain-storage/v1`, and the legacy storage/settlement
adapters.

## Library

```ts
import { verifyEvidenceJson, verifyEnvelope } from "@fileonchain/verify";

const report = await verifyEvidenceJson(rawJson, {
  subjectBytes,              // enables integrity checks
  checkReceiptsOnline: true, // public endpoints only, off by default
  endpoints: { "eip155:11155111": "https://my-node.example" },
});
report.status;  // "valid" | "valid-with-warnings" | "incomplete" | "invalid"
report.ok;      // true unless "invalid"
report.checks;  // [{ name, group, status, detail }]
```

`verifyEvidenceJson` auto-detects the format; `verifyEnvelope` /
`verifyLegacyPackage` target one. The core is isomorphic (browser,
Node, edge); custom receipt adapters register via
`registerAdapter` from `@fileonchain/protocol`.

Exit codes (CLI): `0` not invalid · `1` invalid · `2` usage or I/O
error.

## What a passing report means

Locally verified evidence: specific bytes existed, are unchanged, were
signed by specific keys, and receipts record specific times on specific
systems. It does **not** mean the content is true, legally valid, or
factually accurate — and it proves the key, not the person behind it.
