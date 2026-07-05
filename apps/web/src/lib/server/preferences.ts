import "server-only";

import { eq } from "drizzle-orm";
import { db, userPreferences } from "@/lib/db";
import {
  DEFAULT_PREFERENCES,
  type UserPreferencesData,
} from "@/lib/preferences";

const toData = (
  row: typeof userPreferences.$inferSelect,
): UserPreferencesData => ({
  username: row.username,
  showTestnets: row.showTestnets,
  dateFormat: row.dateFormat,
  analyticsEnabled: row.analyticsEnabled,
  uploadAdvisorEnabled: row.uploadAdvisorEnabled,
  notifyUploadComplete: row.notifyUploadComplete,
  notifyLowCredit: row.notifyLowCredit,
  notifyPromotions: row.notifyPromotions,
  notifyNewsletter: row.notifyNewsletter,
});

/** Read a user's preferences; users without a row get the defaults. */
export const getUserPreferences = async (
  userId: string,
): Promise<UserPreferencesData> => {
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return row ? toData(row) : { ...DEFAULT_PREFERENCES };
};

/** Upsert a partial preferences patch and return the resulting full row. */
export const updateUserPreferences = async (
  userId: string,
  patch: Partial<UserPreferencesData>,
): Promise<UserPreferencesData> => {
  const [row] = await db
    .insert(userPreferences)
    .values({ userId, ...DEFAULT_PREFERENCES, ...patch })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();
  return toData(row);
};

/**
 * Postgres unique-constraint violation (e.g. username already taken).
 * Drizzle wraps driver errors, so walk the `cause` chain for code 23505.
 */
export const isUniqueViolation = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current !== "object") return false;
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (code === "23505") return true;
    current = cause;
  }
  return false;
};
