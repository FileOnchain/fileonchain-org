import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  activityLogs,
  apiKeys,
  creditLedger,
  uploadJobs,
  wallets,
} from "@/lib/db";

/** Read helpers for the dashboard's server components. */

export const getCreditBalance = async (userId: string): Promise<bigint> => {
  const [row] = await db
    .select({
      balance: sql<string>`coalesce(sum(${creditLedger.deltaMicroUsdc}), 0)`,
    })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId));
  return BigInt(row?.balance ?? 0);
};

export const getUploadStats = async (
  userId: string,
): Promise<{ files: number; bytes: number }> => {
  const [row] = await db
    .select({
      files: sql<number>`count(*)`,
      bytes: sql<string>`coalesce(sum(${uploadJobs.fileSizeBytes}), 0)`,
    })
    .from(uploadJobs)
    .where(
      and(eq(uploadJobs.userId, userId), eq(uploadJobs.status, "complete")),
    );
  return { files: Number(row?.files ?? 0), bytes: Number(row?.bytes ?? 0) };
};

export const getActiveApiKeyCount = async (userId: string): Promise<number> => {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
  return Number(row?.count ?? 0);
};

export const getRecentUploadJobs = (userId: string, limit = 8) =>
  db
    .select()
    .from(uploadJobs)
    .where(eq(uploadJobs.userId, userId))
    .orderBy(desc(uploadJobs.createdAt))
    .limit(limit);

export const getRecentActivity = (userId: string, limit = 50) =>
  db
    .select()
    .from(activityLogs)
    .where(eq(activityLogs.userId, userId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);

export const getLedgerEntries = (userId: string, limit = 50) =>
  db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit);

export const getLinkedWallets = (userId: string) =>
  db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .orderBy(wallets.family);
