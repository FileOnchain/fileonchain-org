# FileOnChain

## Portable, independently verifiable evidence — a neutral protocol, an agent profile, a hosted product

**Overview · Version 3.0 · July 2026**

Marc-Aurèle Besner — [fileonchain.org](https://fileonchain.org) —
[github.com/FileOnchain](https://github.com/FileOnchain)

---

FileOnChain turns any digital thing — an agent's output, a legal
document, a software release, a research dataset — into an **evidence
envelope**: a portable JSON document binding the subject's digests to
namespaced claims, cryptographic signatures, and receipts from public
storage and settlement systems, verifiable deterministically and
locally by anyone, with no FileOnChain service in the loop.

The guiding principle of this version:

> **The protocol is neutral, the profile is opinionated, the product is
> convenient.**

The flagship use case is **tamper-evident audit trails for AI agents**;
the machinery underneath assumes nothing about agents, files, or
blockchains.

## The four layers

1. **The FileOnChain Evidence Protocol** — the neutral, normative
   specification: subject descriptors, canonical encoding, namespaced
   claims, context-bound artifact and envelope signatures, tagged
   adapter receipts, envelope digests, and the verification algorithm.
   It never assumes what the subject is; application semantics live in
   profiles, system specifics in adapters.
2. **The Agent Evidence Profile** (`org.fileonchain.agent/v1`) — the
   first official application profile: opinionated claims for AI-agent
   runs (required `runId` and `agentId`; model, tool-call, approval,
   policy, and trace-reference claims), hash-only by default — raw
   prompts are never required.
3. **FileOnChain Cloud** — the hosted commercial product: managed
   signing and settlement, `fok_`-key API, MCP server, dashboard, and
   credit billing in USD/USDC. Non-normative by definition; every
   envelope it produces remains verifiable with the open verifier
   after you leave.
4. **Reference implementations** — MIT-licensed:
   `@fileonchain/protocol`, `@fileonchain/agent-profile`,
   `@fileonchain/verify` (library + `fileonchain verify|migrate` CLI),
   and the reference SDK `@fileonchain/sdk` with `/evidence`,
   `/protocol`, and `/agent-profile` subpaths plus one settlement
   client per chain family.

## Terminology

| Preferred term | Meaning | Not to be confused with |
| --- | --- | --- |
| **Evidence envelope** | The protocol document. "Evidence package" is acceptable user-facing language for the same thing. | — |
| **Subject** / **artifact** | What the evidence is about; an *artifact* is a subject that is concrete bytes. One of six subject types. | The envelope itself |
| **Storage system** | Where subject bytes live, recorded by a storage receipt. | "Storage chain" — storage need not be a chain |
| **Settlement system** | A public system whose transactions fix a digest at a time, recorded by a settlement receipt. | "Anchoring chain" |
| **Multi-system settlement receipts** | Independent attestations from several settlement systems; each stands alone. | A "cross-chain proof" — no system verifies another's consensus, and that phrase is never used |
| **Locally verified evidence** | An envelope whose checks a verifier ran deterministically, offline-first. | A "verified claim" — signatures prove keys and digests, never that a claim is true |
| **FileOnChain Cloud** | The hosted product, always by this name. | "The v1 product" |
| **Reference SDK** | `@fileonchain/sdk` and the packages it re-exports. | The protocol itself |

## The documents

- **A. Protocol specification (normative):**
  [docs/protocol/evidence-protocol.md](protocol/evidence-protocol.md)
- **B. Agent Evidence Profile v1:**
  [docs/profiles/agent-evidence-v1.md](profiles/agent-evidence-v1.md)
- **C. FileOnChain Cloud (non-normative product overview):**
  [docs/product/fileonchain-cloud.md](product/fileonchain-cloud.md)
- **D. Integration status (per-network, honest ladder):**
  [docs/integrations/status.md](integrations/status.md)
- **E. Architecture decision records:**
  [docs/adr/](adr/) — 0001 removal of the token/verification market,
  0002 protocol/profile separation, 0003 canonical JSON, 0004 envelope
  digests and signatures, 0005 hash-only default, 0006 adapter-based
  receipts, 0007 naming.

Conformance fixtures live in
[`packages/protocol/fixtures/`](../packages/protocol/fixtures/); a
conforming verifier reproduces every expected status in its
`manifest.json`.

## Version history

- **v1 (archived)** — a staked verification market: token, validator
  staking, challenge windows, juries, governance. Removed from the
  product and preserved, unmaintained, on the
  `archive/focat-verification-market` branch (ADR 0001).
- **v2 (July 2026)** — the evidence-package descope: one developer
  interface producing portable evidence packages
  (`legacy-evidence-v1`), an open local verifier, honest per-network
  integration statuses, no token anywhere.
- **v3 (this document)** — the separation: the neutral Evidence
  Protocol, the Agent Evidence Profile, FileOnChain Cloud, and the
  reference implementations become four explicitly distinct layers.
  v2 packages remain verifiable forever and migrate with
  `fileonchain migrate`.

---

*FileOnChain is open source under the MIT license. This overview is
informative; where it and the specifications differ, the
specifications and the reference implementations win.*
