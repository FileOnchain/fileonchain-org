import "server-only";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { HttpError } from "@/lib/server/http-error";
import { DEFAULT_RETENTION_DAYS } from "@/lib/db/migrations-helpers";
import { db, evidenceEnvelopes, retentionPolicies } from "@/lib/db";

/**
 * Retention service — per-org retention windows for stored envelopes and
 * the batched sweep that deletes expired rows. The sweep entry point is
 * `sweepExpiredEnvelopes()`; the CLI wrapper lives at
 * `apps/web/scripts/retention-sweep.ts` and is invoked by `pnpm dlx tsx`.
 *
 * Important: a policy change does NOT rewrite existing envelopes' expiry.
 * `applyRetentionToNewEnvelope` is called at submit time, so already-stored
 * rows keep the policy in force when they were sealed. Re-running the
 * sweep + re-seeding is the explicit way to apply a shorter window
 * retroactively.
 */

/** Source of the effective retention window — surfaces the default so
 *  callers can explain "why 180 days" to users. */
export type RetentionSource = "policy" | "default";

/** Read the effective window for an org. Returns the policy value when
 *  present, otherwise the hard-coded default. */
export const getEffectiveRetention = async (
  orgId: string,
): Promise<{ windowDays: number; source: RetentionSource }> => {
  const [row] = await db
    .select({ windowDays: retentionPolicies.windowDays })
    .from(retentionPolicies)
    .where(eq(retentionPolicies.orgId, orgId))
    .limit(1);
  if (row) return { windowDays: row.windowDays, source: "policy" };
  return { windowDays: DEFAULT_RETENTION_DAYS, source: "default" };
};

/** Upsert the per-org retention window. Rejects non-positive values so a
 *  bad client cannot accidentally disable expiry. */
export const setRetentionPolicy = async (
  orgId: string,
  windowDays: number,
): Promise<void> => {
  if (!Number.isInteger(windowDays) || windowDays <= 0) {
    throw new HttpError(400, "windowDays must be a positive integer", "bad_request");
  }
  // ON CONFLICT … DO UPDATE — Drizzle's `onConflictDoUpdate` targets the
  // PK columns by default, which is `(org_id)` here.
  await db
    .insert(retentionPolicies)
    .values({ orgId, windowDays, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: retentionPolicies.orgId,
      set: { windowDays, updatedAt: new Date() },
    });
};

/** Stamp `expires_at` on a freshly-sealed envelope. */
export const applyRetentionToNewEnvelope = async (
  envelopeId: string,
  orgId: string,
  createdAt: Date,
): Promise<Date | null> => {
  const { windowDays } = await getEffectiveRetention(orgId);
  const expiresAt = new Date(
    createdAt.getTime() + windowDays * 24 * 60 * 60 * 1000,
  );
  await db
    .update(evidenceEnvelopes)
    .set({ expiresAt })
    .where(eq(evidenceEnvelopes.id, envelopeId));
  return expiresAt;
};

/**
 * Delete every envelope whose `expires_at < now()`. Returns the count so
 * the CLI / future cron can report. Batched in chunks to keep the
 * transaction short; loop until a batch returns zero rows.
 */
export const sweepExpiredEnvelopes = async (
  { batchSize = 1000 }: { batchSize?: number } = {},
): Promise<{ deleted: number }> => {
  let total = 0;
  for (;;) {
    const rows = await db
      .select({ id: evidenceEnvelopes.id })
      .from(evidenceEnvelopes)
      .where(
        and(
          isNotNull(evidenceEnvelopes.expiresAt),
          lt(evidenceEnvelopes.expiresAt, sql`now()`),
        ),
      )
      .limit(batchSize);
    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    const deleted = await db
      .delete(evidenceEnvelopes)
      .where(inArray(evidenceEnvelopes.id, ids))
      .returning({ id: evidenceEnvelopes.id });
    total += deleted.length;
    if (rows.length < batchSize) break;
  }
  return { deleted: total };
};
