import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { db, evidenceEnvelopes, projects, uploadJobs } from "@/lib/db";
import { HttpError } from "@/lib/server/http-error";

/**
 * Project quota enforcement. Each project may declare monthly caps on
 * envelopes sealed and anchor jobs settled; counters are read from the
 * existing `evidence_envelope.project_id` / `upload_job.project_id`
 * columns (created by migration 0009) at the start of every month, so
 * nothing extra needs to be written at submit time. NULL caps mean
 * unlimited.
 *
 * Callers are `submitEvidence` (envelopesPerMonth) and
 * `anchorWithAccount` (anchorsPerMonth, bytesAnchoredPerMonth). Both
 * throw `project_quota_exceeded` (429) when over the cap. The body
 * shape is the standard typed `HttpError`.
 */

const monthStart = (now: Date = new Date()): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const projectQuotaRow = async (
  projectId: string,
): Promise<typeof projects.$inferSelect | null> => {
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row ?? null;
};

const throwQuotaExceeded = (
  resource: "envelopes" | "anchors" | "bytes_anchored",
  limit: number,
  used: number,
): never => {
  throw new HttpError(
    429,
    `Project quota exceeded for ${resource} (${used}/${limit} this month)`,
    "project_quota_exceeded",
  );
};

/** Count envelopes sealed into this project since the start of the
 *  month. NULL when `projectId` is absent (org-scoped seal). */
export const countEnvelopesThisMonth = async (
  projectId: string,
): Promise<number> => {
  const since = monthStart();
  const [{ value }] = await db
    .select({ value: count() })
    .from(evidenceEnvelopes)
    .where(
      and(
        eq(evidenceEnvelopes.projectId, projectId),
        gte(evidenceEnvelopes.createdAt, since),
      ),
    );
  return Number(value);
};

/** Count anchor jobs in this project since the start of the month. */
export const countAnchorsThisMonth = async (
  projectId: string,
): Promise<number> => {
  const since = monthStart();
  const [{ value }] = await db
    .select({ value: count() })
    .from(uploadJobs)
    .where(
      and(
        eq(uploadJobs.projectId, projectId),
        gte(uploadJobs.createdAt, since),
      ),
    );
  return Number(value);
};

/** Sum the bytes anchored by jobs in this project this month. Returns
 *  0 when there are no jobs. The bigint sum is converted to a JS number
 *  because the column is already declared `mode: "number"` on the
 *  uploadJobs table for ergonomic comparisons against the
 *  `bytesAnchoredPerMonth` cap (which is itself a count capped by the
 *  tier). Numbers above 2^53 are not a real concern for per-month
 *  totals in any realistic deployment. */
export const countBytesAnchoredThisMonth = async (
  projectId: string,
): Promise<number> => {
  const since = monthStart();
  const [row] = await db
    .select({
      value: sql<number>`coalesce(sum(${uploadJobs.fileSizeBytes}), 0)`,
    })
    .from(uploadJobs)
    .where(
      and(
        eq(uploadJobs.projectId, projectId),
        gte(uploadJobs.createdAt, since),
      ),
    );
  return Number(row?.value ?? 0);
};

/** Throw `project_quota_exceeded` (429) when sealing this envelope
 *  would push the project over its envelopesPerMonth cap. No-op when
 *  no project or no cap. */
export const enforceEnvelopeQuota = async (
  projectId: string | null,
): Promise<void> => {
  if (!projectId) return;
  const project = await projectQuotaRow(projectId);
  if (!project || project.envelopesPerMonth == null) return;
  const used = await countEnvelopesThisMonth(projectId);
  if (used >= project.envelopesPerMonth) {
    throwQuotaExceeded("envelopes", project.envelopesPerMonth, used);
  }
};

/** Throw `project_quota_exceeded` (429) when settling this anchor job
 *  would push the project over its `anchorsPerMonth` or
 *  `bytesAnchoredPerMonth` caps. No-op when no project or no cap. */
export const enforceAnchorQuota = async (
  projectId: string | null,
  bytes: number,
): Promise<void> => {
  if (!projectId) return;
  const project = await projectQuotaRow(projectId);
  if (!project) return;
  if (project.anchorsPerMonth != null) {
    const used = await countAnchorsThisMonth(projectId);
    if (used >= project.anchorsPerMonth) {
      throwQuotaExceeded("anchors", project.anchorsPerMonth, used);
    }
  }
  if (project.bytesAnchoredPerMonth != null) {
    const used = await countBytesAnchoredThisMonth(projectId);
    if (used + bytes > project.bytesAnchoredPerMonth) {
      throwQuotaExceeded(
        "bytes_anchored",
        project.bytesAnchoredPerMonth,
        used,
      );
    }
  }
};
