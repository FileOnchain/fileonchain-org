# FileOnChain Cloud

**Status: NON-NORMATIVE.** This document describes FileOnChain's hosted
commercial product. Nothing here defines or constrains the
[FileOnChain Evidence Protocol](../protocol/evidence-protocol.md) or the
[Agent Evidence Profile](../profiles/agent-evidence-v1.md) — those are
open specifications, and every envelope FileOnChain Cloud produces is an
ordinary protocol envelope, verifiable by anyone with the open
reference verifier and no FileOnChain account.

FileOnChain Cloud is the convenience layer: managed keys, managed
settlement transactions, billing, and a dashboard — for teams that want
evidence without operating wallets, RPC endpoints, and signers
themselves. The relationship in one line: **the protocol is neutral,
the profile is opinionated, the product is convenient.**

---

## What exists today

Shipped and usable now:

- **Hosted anchoring API** — `POST /api/v1/anchor` (job status via
  polling) and `/api/v1/credits`, authenticated with dashboard-issued
  `fok_` API keys. FileOnChain's funded signers submit the settlement
  transactions; the caller supplies a CID/digest — hash-only by
  default. The typed client is
  [`@fileonchain/api`](../../packages/api) (also exposed as
  `@fileonchain/sdk/api`).
- **MCP server** — [`@fileonchain/mcp`](../../packages/mcp), a stdio
  Model Context Protocol server: read-only network-registry tools plus
  API-backed anchoring tools, so AI agents can produce evidence
  without holding private keys (env: `FILEONCHAIN_API_KEY`,
  `FILEONCHAIN_API_URL`).
- **Dashboard** — sign in with Google, GitHub, or a wallet
  (sign-message proof); manage API keys, view upload/anchor jobs and
  activity logs, set preferences, and bring-your-own-key (BYOK)
  storage-provider credentials (sealed server-side).
- **Credit billing in USD/USDC** — a credit ledger denominated in
  micro-USDC; deposits in USDC are confirmed against the chain, and
  hosted anchoring debits credits per job (with refunds when a send
  fails). Settlement on public systems always additionally costs that
  system's ordinary transaction fee, which Cloud pays from its signers
  and prices into credits.
- **The webapp** ([fileonchain.org](https://fileonchain.org)) — upload
  and seal flows, an explorer, and the dashboard above. Which networks
  are genuinely live is governed by the integration-status registry —
  see [docs/integrations/status.md](../integrations/status.md); Cloud
  never anchors on a network beyond its status.

## What is planned (not shipped)

Planned capabilities — listed here so they are not mistaken for
current ones:

- **Managed evidence ingestion** — accept sealed envelopes (or seal
  server-side on request), with retention policies and full-text /
  claim-level **search** across an organization's evidence.
- **Organizations and projects** — first-class tenancy with
  project-scoped keys and signature scopes. The organization model
  *partially exists* today (organizations, member roles
  owner/admin/member, org-scoped API routes); projects, quotas, and
  org-wide evidence views do not.
- **Hosted verification pages** — a shareable URL that runs the open
  verifier over an envelope and renders the check report. (The page is
  a convenience rendering; the verdict is always reproducible locally.)
- **Webhooks** — envelope-sealed / receipt-confirmed / verification-run
  event delivery.
- **Exports** — bulk export of an organization's envelopes as
  `.evidence.json` files, at any time, in the open format.
- **Compliance reports** — periodic, signed summaries over an
  organization's evidence.
- **SLAs** — uptime and settlement-latency commitments for paid tiers.

## Roadmap: target API shape

The target public API surface (ROADMAP — only `/api/v1/anchor` and
`/api/v1/credits` exist today):

```
POST /api/v1/evidence               seal + settle an envelope (hash-only by default)
GET  /api/v1/evidence/:id           fetch a sealed envelope (.evidence.json)
GET  /api/v1/evidence?query=…       search claims/subjects across the org
POST /api/v1/agent-runs             sealAgentRun as a service (Agent Evidence Profile)
GET  /api/v1/agent-runs/:runId      run-centric view: envelopes for a run/session
POST /api/v1/verify                 run the open verifier server-side, return the report
GET  /api/v1/credits                credit balance and ledger        (exists)
POST /api/v1/anchor                 settlement-only job              (exists)
```

Design commitments for this surface, stated now: every write endpoint
accepts digests without bytes; every read endpoint returns standard
protocol envelopes; `/verify` returns the same report shape as
`@fileonchain/verify` and is never required — it is a hosted
convenience over the open verifier.

## Trust assumptions

Using Cloud changes *who does the work*, not *what the evidence is*:

- **Cloud executes what you ask.** Its workers sign and send the
  settlement transactions you request with keys Cloud custodies. You
  trust that execution the way you trust any service provider — and
  then you verify its output independently, because the receipts it
  returns are chain-native and checkable against any public node.
- **Hash-only requests never carry artifact bytes.** The default API
  path takes digests/CIDs; your artifact never leaves your custody
  unless you explicitly choose a storage mode that sends bytes.
- **Every Cloud-produced envelope remains verifiable after you
  leave.** Envelopes are standard protocol documents; the reference
  verifier (`fileonchain verify`) checks them deterministically and
  locally with no FileOnChain service in the loop. If FileOnChain
  disappeared tomorrow, existing envelopes and their receipts would
  lose nothing.
- **Signatures made by Cloud signers attribute to Cloud.** If *your*
  key must be the signer of record, sign client-side (the reference
  SDK) and use Cloud only for settlement and convenience.

## Data handling

- Artifact bytes are processed only when a caller explicitly sends
  them (a storage-mode upload or a BYOK provider push); hash-only
  jobs store digests and metadata, never content.
- API keys are stored hashed; BYOK provider credentials are sealed
  with a server-side encryption key.
- Account data (auth identities, wallets, credit ledger, activity
  logs, job records) lives in FileOnChain's database and is not part
  of any envelope unless you put it in claims.
- Envelopes you create are yours: exportable in the open format,
  verifiable without us.

## Product limitations (today)

- Settlement is live only on the networks the integration-status table
  marks as such; everything else is a roadmap adapter. Cloud rejects
  networks that are not open for anchoring.
- No evidence ingestion, search, verification pages, webhooks,
  exports, compliance reports, or SLAs yet (see roadmap above).
- Organizations exist but are not yet wired through evidence flows or
  signature scopes.
- Job status is polling-based; no push delivery.
- The dashboard's chain-side reads (explorer views) still resolve
  through a mock layer in places where an indexer is not yet wired.

Where this document and the code disagree, the code and the
integration-status registry win — Cloud is described only as far as
what is actually deployed.
