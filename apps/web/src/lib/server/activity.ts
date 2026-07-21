import "server-only";
import {
  db,
  activityLogs,
  type ActivityMetadata,
  type ActivityType,
} from "@/lib/db";

/**
 * Append one row to the user's activity log. Fire-and-forget friendly: log
 * writes must never break the action they describe, so failures are only
 * reported to the server console.
 */
export const logActivity = async (
  userId: string,
  type: ActivityType,
  metadata: ActivityMetadata = {},
): Promise<void> => {
  try {
    await db.insert(activityLogs).values({ userId, type, metadata });
  } catch (error) {
    console.error("Failed to record activity log", { type, error });
  }
};

/** Append many rows in a single INSERT. Used by the deposit watcher
 *  after a tick confirms N deposits — one round trip instead of N.
 *  Same fire-and-forget semantics as `logActivity`: a logging failure
 *  is logged but never rethrown. */
export const logActivities = async (
  rows: ReadonlyArray<{
    userId: string;
    type: ActivityType;
    metadata?: ActivityMetadata;
  }>,
): Promise<void> => {
  if (rows.length === 0) return;
  try {
    await db.insert(activityLogs).values(
      rows.map((r) => ({
        userId: r.userId,
        type: r.type,
        metadata: r.metadata ?? {},
      })),
    );
  } catch (error) {
    console.error("Failed to record activity logs", {
      count: rows.length,
      error,
    });
  }
};
