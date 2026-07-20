import "server-only";
import { and, lt, sql } from "drizzle-orm";
import { db, rateLimitWindows } from "@/lib/db";

/**
 * Sweep for the rate-limit counter table. The window length is fixed at
 * 60 seconds; keeping two windows (the current + the previous one) is
 * enough to enforce the limit correctly, so we delete anything older
 * than the current minute. Batched the same way as `retention.ts`'s
 * sweep so a single invocation stays bounded.
 *
 * Returns the count so the cron route and CLI wrapper can report.
 */

const KEEP_WINDOWS = 2;
const BATCH_SIZE = 1_000;

export const sweepExpiredRateLimitWindows = async (
  { batchSize = BATCH_SIZE }: { batchSize?: number } = {},
): Promise<{ deleted: number }> => {
  const cutoff = new Date(
    Math.floor(Date.now() / 60_000) * 60_000 -
      KEEP_WINDOWS * 60_000,
  );
  let total = 0;
  for (;;) {
    const deleted = await db
      .delete(rateLimitWindows)
      .where(
        and(
          lt(rateLimitWindows.windowStart, cutoff),
          sql`${rateLimitWindows.windowStart} IN (
            SELECT "window_start" FROM "rate_limit_window"
             WHERE "window_start" < ${cutoff}
             ORDER BY "window_start" ASC
             LIMIT ${batchSize}
          )`,
        ),
      )
      .returning({ windowStart: rateLimitWindows.windowStart });
    total += deleted.length;
    if (deleted.length < batchSize) break;
  }
  return { deleted: total };
};