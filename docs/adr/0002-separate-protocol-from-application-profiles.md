# ADR 0002 — Separate the protocol from application profiles

**Status:** Accepted
**Date:** 2026-07

## Context

The v2 evidence package (`legacy-evidence-v1`,
`packages/utils/src/evidence.ts`) mixed layers: the artifact descriptor
carried flat AI-flavored provenance metadata (model id, prompt hash,
run id), chain-specific receipt fields (`chainId`, `txHash`) sat
directly in the core schema, and the format lived inside
`@fileonchain/utils` next to the chain registry. That made the format
look like an AI-agent-and-blockchain artifact, when the underlying
mechanism — subject digest, signatures, external receipts — is neutral.
It also meant every new domain (legal documents, software releases,
research datasets) and every new receipt system would have forced core
schema changes.

## Decision

Split into layers with hard boundaries:

1. **`@fileonchain/protocol`** — the neutral FileOnChain Evidence
   Protocol: subject descriptors (six types), namespaced reverse-DNS
   claims, context-bound artifact and envelope signatures, tagged
   adapter receipts, canonical encoding, envelope digests, validation,
   migration. No AI vocabulary, no chain registry, no product code.
   Application semantics enter only through **profiles** (registered
   claim validators); system specifics only through **adapters**.
2. **`@fileonchain/agent-profile`** — the first official profile,
   `org.fileonchain.agent/v1`: opinionated claims for AI-agent runs
   (required `runId`/`agentId`, model, tool calls, approvals, policy,
   trace refs).
3. Unknown profiles and claim namespaces are preserved and reported
   *unknown* by verifiers — never rejected — so third parties can ship
   their own profiles without coordination.

Normative documents mirror the split:
`docs/protocol/evidence-protocol.md` (neutral spec) and
`docs/profiles/agent-evidence-v1.md` (profile).

## Consequences

- The protocol can serve legal, release, dataset, and agent evidence
  with one schema; new domains are new profiles, not schema changes.
- The flagship use case (tamper-evident audit trails for AI agents)
  keeps its opinionated developer experience — it just lives one layer
  up.
- The profile id is bound into artifact signing payloads, so
  signatures cannot be replayed across profiles.
- Verifiers must implement "unknown is not invalid" semantics, which
  adds a fourth result state (`valid-with-warnings`) to the report
  vocabulary.
- The legacy combined format remains verifiable forever and migratable
  (`fileonchain migrate`); its AI-ish metadata migrates into an
  `org.fileonchain.legacy` claim rather than being retrofitted into
  the agent profile.
