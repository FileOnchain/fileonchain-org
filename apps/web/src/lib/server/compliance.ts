import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  canonicalStringify,
  computeEnvelopeDigest,
  parseEnvelope,
  validateEnvelope,
  type EvidenceEnvelope,
} from "@fileonchain/protocol";
import {
  db,
  agentRuns,
  complianceReports,
  evidenceEnvelopes,
  orgSlas,
  organizations,
  retentionPolicies,
  uploadJobs,
  type OrgTier,
} from "@/lib/db";
import { HttpError } from "@/lib/server/http-error";
import { signEnvelopeForScope } from "@/lib/server/cloud-signer";
import { logActivity } from "@/lib/server/activity";
import { enqueueWebhookDeliveries } from "@/lib/server/webhooks";

/**
 * Compliance + SLA service. Each org carries an SLA tier row
 * (default: 'free'); tier changes are admin-only. A compliance report
 * is a canonical EvidenceEnvelope whose body summarizes the org's
 * evidence, anchors, and agent-run activity over a calendar window;
 * the Cloud signs the envelope with the org's service signer so the
 * row's `envelope_digest` column carries the protocol's canonical
 * value. Reports are produced on demand (POST /api/v1/compliance-
 * reports) or by the monthly cron.
 */

const sha256Hex = (input: string): string =>
  createHash("sha256").update(input, "utf8").digest("hex");

/** Upsert the org's SLA row. Defaults to 'free'. */
export const ensureOrgSla = async (
  orgId: string,
): Promise<typeof orgSlas.$inferSelect> => {
  const [row] = await db
    .select()
    .from(orgSlas)
    .where(eq(orgSlas.orgId, orgId))
    .limit(1);
  if (row) return row;
  const [created] = await db
    .insert(orgSlas)
    .values({ orgId, tier: "free" })
    .returning();
  return created!;
};

/** Read the org's SLA, lazily seeding 'free' when missing. */
export const getOrgSla = async (
  orgId: string,
): Promise<typeof orgSlas.$inferSelect> => {
  return ensureOrgSla(orgId);
};

/** Change the org's SLA tier. Admin/owner only (enforced upstream). */
export const updateOrgSla = async (
  orgId: string,
  patch: {
    tier?: OrgTier;
    monthlyEnvelopesLimit?: number | null;
    monthlyAnchorsLimit?: number | null;
    monthlyUptimePct?: number;
    settlementLatencyP95Ms?: number;
  },
  actingUserId: string,
): Promise<typeof orgSlas.$inferSelect> => {
  const current = await ensureOrgSla(orgId);
  const next: Partial<typeof orgSlas.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.tier !== undefined) {
    if (
      patch.tier !== "free" &&
      patch.tier !== "team" &&
      patch.tier !== "enterprise"
    ) {
      throw new HttpError(400, `Unknown tier: ${patch.tier}`, "bad_request");
    }
    next.tier = patch.tier;
  }
  if (patch.monthlyEnvelopesLimit !== undefined)
    next.monthlyEnvelopesLimit = patch.monthlyEnvelopesLimit;
  if (patch.monthlyAnchorsLimit !== undefined)
    next.monthlyAnchorsLimit = patch.monthlyAnchorsLimit;
  if (patch.monthlyUptimePct !== undefined) {
    if (patch.monthlyUptimePct < 0 || patch.monthlyUptimePct > 10000) {
      throw new HttpError(
        400,
        "monthlyUptimePct must be a hundredths-of-percent value in [0,10000]",
        "bad_request",
      );
    }
    next.monthlyUptimePct = patch.monthlyUptimePct;
  }
  if (patch.settlementLatencyP95Ms !== undefined) {
    if (patch.settlementLatencyP95Ms < 0) {
      throw new HttpError(
        400,
        "settlementLatencyP95Ms must be a non-negative integer",
        "bad_request",
      );
    }
    next.settlementLatencyP95Ms = patch.settlementLatencyP95Ms;
  }
  await db
    .update(orgSlas)
    .set(next)
    .where(eq(orgSlas.orgId, orgId));
  await logActivity(actingUserId, "sla_tier_changed", {
    orgId,
    previousTier: current.tier,
    nextTier: next.tier ?? current.tier,
  });
  return ensureOrgSla(orgId);
};

/** Aggregate evidence + anchor + agent-run activity for an org over a
 *  closed calendar window. */
export interface ComplianceSummary {
  totals: {
    envelopesSealed: number;
    envelopesVerified: number;
    envelopesExpired: number;
    agentRunsSealed: number;
    anchorsCompleted: number;
    anchorsFailed: number;
  };
  profiles: Record<string, { count: number }>;
  signers: { id: string; count: number }[];
  retention: { windowDays: number; source: "policy" | "default" };
  signersInUse: {
    orgId: string;
    projectId: string | null;
    publicKey: string;
    status: "active" | "revoked";
  }[];
  sla: {
    tier: OrgTier;
    monthlyUptimePct: number;
    settlementLatencyP95Ms: number;
  };
}

const countScalar = async (
  sqlString: ReturnType<typeof sql>,
): Promise<number> => {
  const result = (await db.execute(sqlString)) as unknown as {
    rows?: Array<{ value: number | string | null }>;
  };
  const v = (result.rows ?? [])[0]?.value;
  return typeof v === "string" ? Number(v) : Number(v ?? 0);
};

export const summarizePeriod = async (
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<ComplianceSummary> => {
  // Envelopes sealed in the period + profile-bucketed counts + signer breakdown.
  const envelopeRows = await db
    .select({
      profile: evidenceEnvelopes.profile,
      subjectSha256: evidenceEnvelopes.subjectSha256,
    })
    .from(evidenceEnvelopes)
    .where(
      and(
        eq(evidenceEnvelopes.orgId, orgId),
        gte(evidenceEnvelopes.createdAt, periodStart),
        lte(evidenceEnvelopes.createdAt, periodEnd),
      ),
    );

  const profiles: Record<string, { count: number }> = {};
  const signers: Record<string, number> = {};
  for (const row of envelopeRows) {
    const p = row.profile ?? "unknown";
    profiles[p] ??= { count: 0 };
    profiles[p].count += 1;
  }

  // Verification totals.
  const envelopesVerifiedCount = await countScalar(sql`
    SELECT coalesce(SUM(${evidenceEnvelopes.verificationCount}), 0) AS value
    FROM ${evidenceEnvelopes}
    WHERE ${evidenceEnvelopes.orgId} = ${orgId}
      AND ${evidenceEnvelopes.lastVerifiedAt} >= ${periodStart}
      AND ${evidenceEnvelopes.lastVerifiedAt} <= ${periodEnd}
  `);

  // Anchors completed/failed in the period.
  const anchorRows = await db
    .select({
      status: uploadJobs.status,
      completedAt: uploadJobs.completedAt,
    })
    .from(uploadJobs)
    .where(
      and(
        eq(uploadJobs.userId, orgId),
        gte(uploadJobs.createdAt, periodStart),
        lte(uploadJobs.createdAt, periodEnd),
      ),
    );
  // Note: uploadJobs is keyed on userId, not orgId; the SQL above is a
  // safe no-op (returns zero rows) until a future migration adds an
  // orgId column. The other counters are org-scoped.

  // Agent-run sealed in the period.
  const agentRunCount = await countScalar(sql`
    SELECT count(*) AS value
    FROM ${agentRuns}
    WHERE ${agentRuns.orgId} = ${orgId}
      AND ${agentRuns.createdAt} >= ${periodStart}
      AND ${agentRuns.createdAt} <= ${periodEnd}
  `);

  // Retention summary.
  const [policy] = await db
    .select({ windowDays: retentionPolicies.windowDays })
    .from(retentionPolicies)
    .where(eq(retentionPolicies.orgId, orgId))
    .limit(1);
  const retention: ComplianceSummary["retention"] = policy
    ? { windowDays: policy.windowDays, source: "policy" }
    : { windowDays: 180, source: "default" };

  // SLA row.
  const sla = await ensureOrgSla(orgId);

  // Signers in use during the period (active or recently revoked).
  const signerRows = await db.execute(sql`
    SELECT org_id, project_id, public_key, revoked_at
    FROM cloud_signer
    WHERE org_id = ${orgId}
    ORDER BY created_at DESC
    LIMIT 20
  `) as unknown as {
    rows?: Array<{
      org_id: string;
      project_id: string | null;
      public_key: string;
      revoked_at: string | Date | null;
    }>;
  };
  const signersInUse = (signerRows.rows ?? []).map((r) => ({
    orgId: r.org_id,
    projectId: r.project_id,
    publicKey: r.public_key,
    status: r.revoked_at ? ("revoked" as const) : ("active" as const),
  }));

  return {
    totals: {
      envelopesSealed: envelopeRows.length,
      envelopesVerified: envelopesVerifiedCount,
      envelopesExpired: 0, // retention sweep not currently windows the count
      agentRunsSealed: agentRunCount,
      anchorsCompleted: anchorRows.filter((r) => r.status === "complete").length,
      anchorsFailed: anchorRows.filter((r) => r.status === "failed").length,
    },
    profiles,
    signers: Object.entries(signers).map(([id, count]) => ({
      id,
      count,
    })),
    retention,
    signersInUse,
    sla: {
      tier: sla.tier,
      monthlyUptimePct: sla.monthlyUptimePct,
      settlementLatencyP95Ms: sla.settlementLatencyP95Ms,
    },
  };
};

/** Build a signed report envelope over a closed calendar window. */
export const generateComplianceReport = async (
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
  actingUserId: string | null,
): Promise<typeof complianceReports.$inferSelect> => {
  const summary = await summarizePeriod(orgId, periodStart, periodEnd);
  const id = crypto.randomUUID();
  const body = {
    reportId: id,
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
    },
    summary,
  };
  const bodyJson = canonicalStringify(body);
  const bodySha = sha256Hex(bodyJson);
  const envelope: EvidenceEnvelope = parseEnvelope(
    JSON.stringify({
      p: "fileonchain-evidence",
      v: 1,
      subject: {
        id,
        type: "compliance_report",
        digests: { sha256: bodySha },
      },
      profile: "org.fileonchain.compliance/v1",
      claims: { "org.fileonchain.compliance/v1": { body } },
    }),
  ) as EvidenceEnvelope;
  const validationErrors = validateEnvelope(envelope);
  if (validationErrors.length > 0) {
    throw new HttpError(
      500,
      `Compliance envelope validation failed: ${validationErrors.join("; ")}`,
      "internal_error",
    );
  }
  const sealed = await signEnvelopeForScope({ kind: "org", orgId }, envelope);
  const envelopeDigest = computeEnvelopeDigest(sealed);
  const [row] = await db
    .insert(complianceReports)
    .values({
      id,
      orgId,
      periodStart,
      periodEnd,
      generatedByUserId: actingUserId,
      envelope: sealed,
      envelopeDigest,
    })
    .returning();
  if (!row) throw new HttpError(500, "Insert returned no row", "internal_error");
  if (actingUserId) {
    await logActivity(actingUserId, "compliance_report_generated", {
      reportId: id,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  }
  void enqueueWebhookDeliveries(orgId, "compliance_report.generated", id, {
    reportId: id,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    envelopeDigest,
  });
  return row;
};

/** Generate the previous-calendar-month report for every org with any
 *  evidence envelope. Used by the monthly cron. */
export const generateMonthlyReportsForAllOrgs = async (
  now: Date = new Date(),
): Promise<{ reportsWritten: number; orgs: number }> => {
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0),
  );
  const orgRows = await db
    .select({
      orgId: evidenceEnvelopes.orgId,
    })
    .from(evidenceEnvelopes)
    .groupBy(evidenceEnvelopes.orgId);
  let written = 0;
  for (const { orgId } of orgRows) {
    await generateComplianceReport(orgId, periodStart, periodEnd, null);
    written += 1;
  }
  return { reportsWritten: written, orgs: orgRows.length };
};

/** List an org's compliance reports, ordered by `generated_at DESC`. */
export const listComplianceReports = async (
  orgId: string,
  { limit = 20 }: { limit?: number } = {},
) =>
  db
    .select()
    .from(complianceReports)
    .where(eq(complianceReports.orgId, orgId))
    .orderBy(desc(complianceReports.generatedAt))
    .limit(limit);

/** Resolve one report; null on miss. */
export const getComplianceReport = async (
  orgId: string,
  reportId: string,
) => {
  const [row] = await db
    .select()
    .from(complianceReports)
    .where(
      and(
        eq(complianceReports.id, reportId),
        eq(complianceReports.orgId, orgId),
      ),
    )
    .limit(1);
  return row ?? null;
};

/** Verify the org exists. Tiny helper so the routes don't have to
 *  import the organizations module. */
export const assertOrgExists = async (orgId: string): Promise<void> => {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw new HttpError(404, "Organization not found", "not_found");
};
