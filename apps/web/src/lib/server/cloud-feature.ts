import "server-only";
import { env } from "@/lib/env";

/**
 * Single source of truth for the Cloud feature flags. Every new
 * `/api/v1/*` route and every `/cloud/*` page imports this so the
 * short-circuit behavior is consistent: when OFF, routes return 503 with a
 * structured error body and pages render the Planned empty state.
 *
 * The flags are read on each call (lazy `env.*`) so flipping the env at
 * runtime via a deploy does not require a server restart.
 *
 * Existing wired-behind-flag Cloud group: `FILEONCHAIN_CLOUD_EVIDENCE_ENABLED`
 * — gates the evidence/agent-runs/verify/retention/sign surfaces.
 *
 * Each new feature in this build has its own flag so it can ship and flip
 * independently from the others:
 *   - `isCloudTenancyEnabled`  — projects + quotas + per-project signers
 *   - `isCloudWebhooksEnabled` — outbound webhook delivery
 *   - `isCloudExportsEnabled`  — bulk `.evidence.json` exports
 *   - `isCloudComplianceEnabled` — signed compliance reports + tier SLAs
 */

export const isCloudEvidenceEnabled = (): boolean => env.cloudEvidenceEnabled;

/** Projects + quotas + per-project Cloud signers (`/cloud/projects/*`,
 *  project-scoped API keys, the project_id columns on envelopes and
 *  anchor jobs, the quota gates in `submitEvidence` /
 *  `anchorWithAccount`). Falls under the broader Cloud evidence surface:
 *  any tenant that opts into projects must also be on Cloud. */
export const isCloudTenancyEnabled = (): boolean =>
  env.cloudEvidenceEnabled && env.cloudTenancyEnabled;

/** Webhook endpoints, subscriptions, deliveries, and the
 *  `webhooks-drain` cron. Tenancy is irrelevant — webhooks fire on any
 *  org's evidence events. */
export const isCloudWebhooksEnabled = (): boolean => env.cloudWebhooksEnabled;

/** Bulk `.evidence.json` export jobs and the `exports-sweep` cron.
 *  Tenancy is irrelevant for the read path; org-scoped API keys
 *  authorise the export. */
export const isCloudExportsEnabled = (): boolean => env.cloudExportsEnabled;

/** Signed monthly compliance reports, the SLA tier model, and the
 *  `compliance-reports-build` cron. */
export const isCloudComplianceEnabled = (): boolean =>
  env.cloudComplianceEnabled;

/** The "this surface is not enabled" body returned by every gated route.
 *  Same shape across every gate so API consumers branch on `code`, not
 *  on text. */
export const CLOUD_DISABLED_BODY = {
  error: "Cloud surface is not enabled",
  code: "not_implemented",
} as const;

export const CLOUD_TENANCY_DISABLED_BODY = {
  error: "Cloud projects + quotas are not enabled",
  code: "not_implemented",
} as const;

export const CLOUD_WEBHOOKS_DISABLED_BODY = {
  error: "Cloud webhooks are not enabled",
  code: "not_implemented",
} as const;

export const CLOUD_EXPORTS_DISABLED_BODY = {
  error: "Cloud bulk exports are not enabled",
  code: "not_implemented",
} as const;

export const CLOUD_COMPLIANCE_DISABLED_BODY = {
  error: "Cloud compliance reports are not enabled",
  code: "not_implemented",
} as const;
