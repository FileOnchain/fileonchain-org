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

### Wired behind `FILEONCHAIN_CLOUD_EVIDENCE_ENABLED`

The backend, schema, and pages ship in this build. The routes and UI
are not reachable for users until the env var is set to `1`. Org-scoped
API keys (`scope = "org"`, `orgId != NULL`) are required by every
endpoint in this group.

- **Managed evidence ingestion** — `POST /api/v1/evidence` accepts a
  sealed envelope, `GET /api/v1/evidence/:id` returns the canonical
  envelope JSON, `GET /api/v1/evidence?query=…` is claim-level + signer
  search across the org's envelopes. The schema adds
  `evidence_envelope` (per-org tenancy, GIN-indexed `tsvector` on
  subject/profile/keys/signers), and `retention_policy` for the
  per-org retention window.
- **Server-side signer (`server_sign`)** — opt in with
  `?server_sign=1` (or header `x-fileonchain-server-sign: 1`) on the
  ingestion / agent-run routes and the Cloud adds an **envelope**
  signature using the org's `service` key. This attests only that the
  Cloud assembled/exported the envelope — it is never an artifact
  signature and makes no claim about who authored the subject, so the
  two remain reported separately. Keys are per-org ed25519, generated /
  rotated / revoked from `apps/web/src/app/cloud/signer` (owner/admin),
  with the seed sealed at rest (`lib/crypto/secretbox.ts`); the public
  key + status is served unauthenticated at
  `GET /api/cloud/signer/:orgId` (the signer's `keyStatusUrl`).
  Submissions requesting `server_sign` fail with 409 until the org has
  generated a key.
- **Agent-run sealing** — `POST /api/v1/agent-runs` stores an Agent
  Evidence Profile envelope (with optional `server_sign`);
  `GET /api/v1/agent-runs/:runId` is the run-centric view. The
  `agent_run` table is the `(runId, agentId, envelopeId)` join key plus
  an audit trail.
- **Hosted verification pages** — `apps/web/src/app/cloud/verify/[envelopeId]`
  runs the open verifier over a stored envelope and renders the check
  report. Same chip wording and grouped sections as `/verify` — the
  page is a convenience rendering; the verdict is always reproducible
  locally. The page is **org-member-only** (session auth via
  `auth()`; non-members are redirected to `/login`). Public,
  shareable verification of stored envelopes is **not** part of this
  build — for a public verification path, use `/verify` with the
  envelope JSON uploaded by the requester, or expose the
  `evidence_envelope` JSON via the org's own application.
- **Server-side verify** — `POST /api/v1/verify` runs `@fileonchain/verify`
  server-side and returns the same `VerificationReport` shape. Accepts
  `{ envelopeId }` (server fetches + ownership-checks) or `{ envelope }`
  (caller-supplied, no DB lookup).
- **Retention** — `GET /api/v1/retention` returns the effective
  window for the org; `PATCH /api/v1/retention` upserts (org-scoped API
  key). The dashboard editor at `apps/web/src/app/cloud/retention`
  writes through the session-authed
  `PATCH /api/organizations/:id/retention` (owner/admin). Default
  window: 180 days. New envelopes are stamped with `expires_at` at
  submit time (`applyRetentionToNewEnvelope`); a daily Vercel Cron job
  (`vercel.json` → `GET /api/cron/retention-sweep`, guarded by
  `CRON_SECRET`) deletes expired rows. `apps/web/scripts/retention-sweep.ts`
  remains the equivalent manual invocation for ops.

### Wired behind the next four flags

Each of the following ships with its own lazy env var (read on each
call, so flipping it at runtime does not need a server restart).
They are *additive* — none of the existing surfaces change.

- **Projects + quotas + per-project signers** — gated on
  `FILEONCHAIN_CLOUD_TENANCY_ENABLED`. New `project` and
  `project_member` tables; `api_keys.scope` widens to
  `"personal" | "org" | "project"` with a nullable `project_id`
  column on `api_keys`. The Cloud signer table gets a nullable
  `project_id` column too — partial unique indexes enforce one active
  (revoked_at IS NULL) signer per org AND one active per project. The
  new `submitEvidence` opt-in `?server_sign_project=1` (header
  `x-fileonchain-server-sign-project: 1`) routes the envelope through
  the project's service signer. Per-project monthly caps
  (`envelopes_per_month`, `anchors_per_month`,
  `bytes_anchored_per_month`) are read straight off the
  `evidence_envelope.project_id` and `upload_job.project_id` columns,
  enforced at submit time, returning `429 project_quota_exceeded`.
  Dashboard: `/cloud/projects` + `/cloud/projects/[id]`.

- **Webhooks** — gated on `FILEONCHAIN_CLOUD_WEBHOOKS_ENABLED`.
  Outbound `webhook_endpoint` / `webhook_subscription` /
  `webhook_delivery` tables. HMAC-SHA-256 over `${unix}.${rawBody}`
  (Stripe-style `X-FileOnChain-Signature: t=<ts>,v1=<hex>`). Delivery
  is best-effort with exponential backoff (30s, 5m, 30m, 2h, 8h;
  capped at 5 attempts); the per-minute Vercel Cron
  `/api/cron/webhooks-drain` picks up due rows. Eight event types:
  `evidence.sealed`, `evidence.verified`, `evidence.expired`,
  `agent_run.sealed`, `anchor.job.settled`, `signer.rotated`,
  `signer.revoked`, `compliance_report.generated`. v1 routes at
  `/api/v1/webhooks*` + dashboard at `/cloud/webhooks`.

- **Bulk `.evidence.json` exports** — gated on
  `FILEONCHAIN_CLOUD_EXPORTS_ENABLED`. New `export_job` table. The
  build streams a cursor-paginated read of `evidence_envelope` rows
  into a server-local TAR archive (one file per envelope, named
  `<envelopeId>.evidence.json`); the tar is byte-streamed without any
  compression dep and never holds the whole archive in memory.
  Download links carry a one-time token and expire 24h after the
  build completes; the daily `/api/cron/exports-sweep` cleans up rows
  + files past expiry. v1 routes at `/api/v1/exports*` + dashboard at
  `/cloud/exports`.

- **Compliance reports + SLAs** — gated on
  `FILEONCHAIN_CLOUD_COMPLIANCE_ENABLED`. New `org_sla` table
  (tier + monthly caps + uptime + p95 settlement latency); new
  `compliance_report` table whose row carries the canonical
  `EvidenceEnvelope` JSON of the report body, signed by the org's
  service signer, with the protocol's `envelope_digest` of record
  on the row. The monthly cron
  `/api/cron/compliance-reports-build` covers the previous
  calendar-month for every org with at least one envelope. On-demand
  via `POST /api/v1/compliance-reports`. v1 routes at
  `/api/v1/compliance-reports*` + `/api/v1/sla`, dashboard at
  `/cloud/compliance`.

### Still future

- **Cross-org report signing keys** — each org's report is currently
  signed by the org's `service` key. A separate "compliance-signer"
  identity that does not mint artifact signatures is straightforward
  follow-up when audit separation requires it.
- **SLA breach alerting** — published target vs. delivered
  observations tracked per period; today the dashboard surfaces only
  the tier promise, not the rolling-window evidence.

## Roadmap: target API shape

The public API surface — `/api/v1/anchor` and `/api/v1/credits` are
available today; the rest of the surface ships behind the per-feature
flags above:

```
POST /api/v1/evidence               seal + settle an envelope (hash-only by default)
GET  /api/v1/evidence/:id           fetch a sealed envelope (.evidence.json)
GET  /api/v1/evidence?query=…       search claims/subjects across the org
POST /api/v1/agent-runs             sealAgentRun as a service (Agent Evidence Profile)
GET  /api/v1/agent-runs/:runId      run-centric view: envelopes for a run/session
POST /api/v1/verify                 run the open verifier server-side, return the report
GET  /api/v1/retention              effective retention window for the org
PATCH /api/v1/retention             upsert the org's retention window (days)
GET  /api/v1/credits                credit balance and ledger        (exists)
POST /api/v1/anchor                 settlement-only job              (exists)

# Tenancy flag — adds a third API key scope
POST   /api/organizations/:id/projects              create a project
GET    /api/organizations/:id/projects              list (project-scoped to caller)
PATCH  /api/projects/:id                            rename
DELETE /api/projects/:id                            drop
PATCH  /api/projects/:id/quotas                     update monthly caps + retention
POST   /api/projects/:id/members                    add a member
DELETE /api/projects/:id/members/:userId            remove
POST   /api/projects/:id/signer                     generate / rotate / revoke the project's service key
POST   /api/v1/evidence?server_sign_project=1       project-attributed envelope sealing

# Webhooks flag
GET    /api/v1/webhooks                             list endpoints
POST   /api/v1/webhooks                             create (returns signing secret once)
GET    /api/v1/webhooks/:id                         read
PATCH  /api/v1/webhooks/:id                         update
DELETE /api/v1/webhooks/:id                         soft-disable
POST   /api/v1/webhooks/:id/rotate_secret           mint a fresh signing secret
GET    /api/v1/webhooks/:id/deliveries              recent delivery audit
POST   /api/v1/webhooks/deliveries/:id/redeliver    force a replay

# Exports flag
POST   /api/v1/exports                              start a build
GET    /api/v1/exports                              list recent
GET    /api/v1/exports/:id                          status
DELETE /api/v1/exports/:id                          cancel / purge
GET    /api/v1/exports/:id/download?token=…         stream the TAR

# Compliance flag
GET    /api/v1/compliance-reports                   list recent reports
POST   /api/v1/compliance-reports                   on-demand generation
GET    /api/v1/compliance-reports/:id               fetch the signed envelope
GET    /api/v1/sla                                  current tier + limits
PATCH  /api/v1/sla                                  admin-only tier change
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
- The evidence ingestion, agent-run, hosted verification, retention,
  search, and server-side verify surfaces ship behind
  `FILEONCHAIN_CLOUD_EVIDENCE_ENABLED` and are not reachable for users
  until the flag is set. The Cloud schema, routes, services, and webapp
  pages are wired and tested in this build; what is missing is the
  decision to open the surface.
- Webhooks, exports, compliance reports, and SLAs are still future (see
  roadmap above).
- Projects, per-project signature scopes, and per-project quotas are
  still future. Organizations are wired through evidence flows in this
  build (org-scoped API keys, org-scoped evidence rows).
- Job status is polling-based; no push delivery.
- The dashboard's chain-side reads (explorer views) still resolve
  through a mock layer in places where an indexer is not yet wired.

Where this document and the code disagree, the code and the
integration-status registry win — Cloud is described only as far as
what is actually deployed.
