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
