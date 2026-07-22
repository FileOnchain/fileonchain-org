# Deploy: FileOnChain Cloud

Operationally hardens and turns on the [FileOnChain Cloud](../product/fileonchain-cloud.md)
surface on an existing Vercel + Neon deployment. The product is the
**commercial** layer — managed keys, hosted anchoring, billing, dashboard —
on top of the open [Evidence Protocol](../protocol/evidence-protocol.md) and
[Agent Evidence Profile](../profiles/agent-evidence-v1.md). The protocol is
neutral; the Cloud surface is what the dashboard, `/api/v1/*`, MCP, and the
internal `/cloud/*` pages ship behind.

This runbook assumes the webapp already builds (`pnpm build`) and the
[account backend](./indexer.md) — auth, DB, credits, API keys, BYOK — is
wired. The Cloud surface adds five env-controlled surfaces, a per-minute
webhook drain, four daily/monthly crons, and per-tenant key custody.

---

## The five flags

The Cloud surface is split into **one primary flag** and **four additive
flags**. Each is lazy — read on every call — so flipping an env at runtime
takes effect on the next request, no restart. They are all read through
`apps/web/src/lib/env.ts` and routed through `lib/server/cloud-feature.ts`,
which is the single source of truth for the gate.

| Flag | Gates | Required other flags |
| --- | --- | --- |
| `FILEONCHAIN_CLOUD_EVIDENCE_ENABLED` | `/api/v1/{evidence,agent-runs,verify,retention}` + the `/cloud/{signer,verify,retention,search}` pages | — |
| `FILEONCHAIN_CLOUD_TENANCY_ENABLED` | `/api/organizations/:id/projects*`, `/api/projects/*`, project-scoped API keys, per-project Cloud signers, the `/cloud/projects/*` pages, the quota gates on `/api/v1/{evidence,agent-runs,anchor}` | Requires `FILEONCHAIN_CLOUD_EVIDENCE_ENABLED=1` |
| `FILEONCHAIN_CLOUD_WEBHOOKS_ENABLED` | `/api/v1/webhooks/*`, `/cloud/webhooks`, the `webhooks-drain` cron | — |
| `FILEONCHAIN_CLOUD_EXPORTS_ENABLED` | `/api/v1/exports/*`, `/cloud/exports`, the `exports-sweep` cron | — |
| `FILEONCHAIN_CLOUD_COMPLIANCE_ENABLED` | `/api/v1/compliance-reports/*`, `/api/v1/sla`, `/cloud/compliance`, the `compliance-reports-build` cron | — |

When a flag is off, every gated route returns `503` with a structured
`{ "error": "…", "code": "not_implemented" }` body and every gated page
renders the Planned empty state. Pages show the localisable reason so
support can answer "why is this disabled" without grepping the code.

The doc `docs/product/fileonchain-cloud.md` is the canonical list of what
each surface does; this runbook is the ops view.

---

## Production env (minimum)

```bash
# Secrets — required for the Cloud surface to come up at all
DATABASE_URL=postgres://…-pooler.…neon.tech/…     # Neon WebSocket (interactive txns)
AUTH_SECRET=$(openssl rand -base64 32)            # JWT session
BYOK_ENCRYPTION_KEY=$(openssl rand -base64 32)     # AES-256-GCM for BYOK + Cloud signer seeds
CRON_SECRET=$(openssl rand -base64 32)             # Vercel Cron → /api/cron/* guard

# Cloud flags — uncomment to open the surface
FILEONCHAIN_CLOUD_EVIDENCE_ENABLED=1
FILEONCHAIN_CLOUD_TENANCY_ENABLED=1
FILEONCHAIN_CLOUD_WEBHOOKS_ENABLED=1
FILEONCHAIN_CLOUD_EXPORTS_ENABLED=1
FILEONCHAIN_CLOUD_COMPLIANCE_ENABLED=1

# Per-org Cloud signer seeds (server_sign) — sealed at rest with BYOK_ENCRYPTION_KEY
# when an org generates a signer via /cloud/signer. No env var needed; the keys
# live in the DB, encrypted under BYOK_ENCRYPTION_KEY.

# Rate-limit overrides for the /api/v1/* API-key surface (defaults in
# lib/server/rate-limit.ts: 600/min api-key, 60/min IP, 60/min POST /v1/anchor,
# 120/min POST /v1/evidence). Tune via env without a redeploy.
RATE_LIMIT_V1_PER_MIN=600
RATE_LIMIT_V1_ANCHOR_PER_MIN=60
RATE_LIMIT_V1_EVIDENCE_PER_MIN=120
RATE_LIMIT_V1_IP_PER_MIN=60
```

Signers (`ANCHOR_*`) and chain registries are **separate** from the Cloud
flags — they decide which chains the hosted anchor worker can settle on.
See `docs/deploy/memo-families.md` and `docs/deploy/evm.md` for per-family
provisioning. Without an `ANCHOR_EVM_PRIVATE_KEY` (etc.) the Cloud still
accepts `/api/v1/anchor` jobs but the worker falls back to the deterministic
mock anchor — the credit ledger still debits, no real tx is sent.

---

## Crons

`apps/web/vercel.json` schedules the seven cron routes on Vercel. Vercel
sends `Authorization: Bearer $CRON_SECRET` to each; the route rejects
without it (`/api/cron/*` returns 401 when the secret is unset or
mismatched). The same routes are reachable as `tsx` scripts for manual
ops runs — useful when the Vercel scheduler is paused or under audit.

| Cron | Schedule | What it does |
| --- | --- | --- |
| `/api/cron/indexer-scan` | `47 1 * * *` | Pulls `CIDAnchored` + `ChunkAnchored` from Sepolia + Chronos into `indexed_anchor_event` (the explorer). |
| `/api/cron/rate-limit-sweep` | `27 4 * * *` | Drops stale rate-limit buckets. |
| `/api/cron/deposits-watch` | `57 2 * * *` | Confirms USDC `Transfer` events → credit deposits. |
| `/api/cron/retention-sweep` | `17 3 * * *` | Deletes expired `evidence_envelope` rows + fan-out `evidence.expired` webhooks. |
| `/api/cron/webhooks-drain` | `* * * * *` | Webhook delivery with exponential backoff (30s, 5m, 30m, 2h, 8h; capped at 5 attempts). |
| `/api/cron/exports-sweep` | `37 3 * * *` | Cleans up `export_job` rows + on-disk TAR files past their 24h download window. |
| `/api/cron/compliance-reports-build` | `0 4 1 * *` | Monthly signed compliance reports for every org with at least one envelope. |

Every cron route imports `run*` from a sibling `scripts/*.ts` so the path
is the same whether Vercel or a human triggers it. Run any of them manually:

```bash
pnpm --filter @fileonchain/web exec tsx scripts/retention-sweep.ts
pnpm --filter @fileonchain/web exec tsx scripts/webhooks-drain.ts
pnpm --filter @fileonchain/web exec tsx scripts/exports-sweep.ts
pnpm --filter @fileonchain/web exec tsx scripts/compliance-reports-build.ts
```

---

## Smoke test (post-deploy)

Run this before opening the surface to a real user. It exercises every
gated route from a canary `fok_` API key and asserts the structured error
shapes match the docs.

```bash
# 1. Confirm the build is green
pnpm build

# 2. Confirm the DB migrations are current
pnpm --filter @fileonchain/web db:migrate

# 3. Confirm the smoke script (exists; see apps/web/scripts/cloud-smoke.ts)
pnpm --filter @fileonchain/web exec tsx scripts/cloud-smoke.ts
```

The script hits each gated route under the canary's API key and reports
the status codes. The expected profile when the flags are on:

| Surface | Endpoint | Expected when ON |
| --- | --- | --- |
| Evidence | `POST /api/v1/evidence` | 200 (no body) or 400 (missing envelope) |
| Evidence | `GET /api/v1/evidence?query=` | 200 + empty `hits` |
| Agent-runs | `POST /api/v1/agent-runs` | 200 or 400 |
| Hosted verify | `POST /api/v1/verify` | 200 or 400 |
| Retention | `GET /api/v1/retention` | 200 with the canary org's window |
| Retention | `PATCH /api/v1/retention` | 200 (no-op when `FILEONCHAIN_CLOUD_TENANCY_ENABLED` is off) |
| Webhooks | `GET /api/v1/webhooks` | 200 + empty list |
| Exports | `GET /api/v1/exports` | 200 + empty list |
| Compliance | `GET /api/v1/sla` | 200 with the canary org's tier |
| Projects | `GET /api/organizations/:id/projects` | 200 + empty list (when tenancy flag is on) |

When a flag is off, the gated routes return 503 with `code: not_implemented`.

---

## Key custody

- **Cloud signer seeds** (`server_sign`) — generated per-org (or per
  project under the tenancy flag) via `/cloud/signer`. The seed is sealed
  with `BYOK_ENCRYPTION_KEY` via AES-256-GCM (`lib/crypto/secretbox.ts`)
  before it touches the DB and never leaves the server. The public key +
  status is served unauthenticated at `/api/cloud/signer/[orgId]` so any
  verifier can check rotation/revocation independently.
- **API keys** (`fok_…`) — hashed at rest via the same secretbox-like path;
  raw keys are shown **once** on creation. Treat `FILEONCHAIN_API_KEY` on
  the [MCP server](../../packages/mcp) as a credential, not a config value.
- **BYOK provider keys** — sealed under `BYOK_ENCRYPTION_KEY`. Decrypted
  only inside the request that uses them.

Rotate `BYOK_ENCRYPTION_KEY` is a **data migration** — existing rows
(Cloud signer seeds, BYOK provider keys) are sealed with the old key. See
`docs/adr/` for the planned rotation procedure; not in v1 scope.

---

## Observability

Every cron route returns a JSON body with the count of rows touched:

```json
{ "ok": true, "deleted": 0, "sweptAt": "2026-07-21T03:17:00.000Z" }
```

The webhook-drain returns per-org delivery counts in the same shape. When
any of these routes non-zero-error, Vercel surfaces the failure in the
Functions tab — the response body is the diagnostic.

GA4 events on the dashboard pages fire through `lib/analytics.ts` — add
new events to the `AnalyticsEvents` map rather than calling `sendGAEvent`
directly. Cloud surfaces share the same analytics-cookies preference:
GA mounts only when the user has opted in.

---

## Going live

1. **Pilot** — flip `FILEONCHAIN_CLOUD_EVIDENCE_ENABLED=1` first. The
   `/api/v1/{evidence,agent-runs,verify,retention}` surface + the
   `/cloud/{signer,verify,retention,search}` pages become reachable.
   `/api/v1/anchor` and `/api/v1/credits` are already live (they predate
   the flag).
2. **Tenancy** — flip `FILEONCHAIN_CLOUD_TENANCY_ENABLED=1`. The
   `project` / `project_member` tables light up; the per-project signers
   and the quota gates on `/api/v1/{evidence,agent-runs,anchor}` turn on.
3. **Webhooks** — flip `FILEONCHAIN_CLOUD_WEBHOOKS_ENABLED=1`. The
   `webhooks-drain` cron starts firing; existing envelopes re-sealed
   after the flip will emit `evidence.sealed` events (past events are not
   back-filled).
4. **Exports** — flip `FILEONCHAIN_CLOUD_EXPORTS_ENABLED=1`. Same caveat:
   no back-fill; the `/api/v1/exports` build is on-demand.
5. **Compliance** — flip `FILEONCHAIN_CLOUD_COMPLIANCE_ENABLED=1`. The
   `compliance-reports-build` cron runs on the 1st of every month at 04:00
   UTC and covers the **previous** calendar month. The first run after the
   flip builds the in-progress period (partial month) only when the cron
   includes a catch-up flag — confirm with the ops runbook before opening
   the surface to paying tenants.

The flags are independent, so flipping them in this order is the
documented rollout. Each is reversible without a code change — set the
env back to `0` (or unset) and the routes return 503 on the next call.
