import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getChain, type ChainId } from "@fileonchain/sdk";
import { db, customRpcEndpoints } from "@/lib/db";
import type { CustomRpcMap } from "@/lib/rpc-endpoints";

/**
 * Read a user's custom RPC overrides as a chainId → url map. Rows whose
 * chain no longer exists in the SDK registry are skipped (a chain can be
 * removed from `chains.ts` after a row was written).
 */
export const getUserRpcOverrides = async (
  userId: string,
): Promise<CustomRpcMap> => {
  const rows = await db
    .select()
    .from(customRpcEndpoints)
    .where(eq(customRpcEndpoints.userId, userId));
  const map: CustomRpcMap = {};
  for (const row of rows) {
    if (getChain(row.chainId)) map[row.chainId] = row.url;
  }
  return map;
};

/**
 * Apply a patch of chainId → url (upsert) | null (delete) entries and return
 * the resulting full map. Callers validate URLs before getting here.
 */
export const updateUserRpcOverrides = async (
  userId: string,
  patch: Partial<Record<ChainId, string | null>>,
): Promise<CustomRpcMap> => {
  const removals = Object.entries(patch)
    .filter(([, url]) => url === null)
    .map(([chainId]) => chainId as ChainId);
  const upserts = Object.entries(patch).filter(
    (entry): entry is [ChainId, string] => typeof entry[1] === "string",
  );

  if (removals.length > 0) {
    await db
      .delete(customRpcEndpoints)
      .where(
        and(
          eq(customRpcEndpoints.userId, userId),
          inArray(customRpcEndpoints.chainId, removals),
        ),
      );
  }
  for (const [chainId, url] of upserts) {
    await db
      .insert(customRpcEndpoints)
      .values({ userId, chainId, url })
      .onConflictDoUpdate({
        target: [customRpcEndpoints.userId, customRpcEndpoints.chainId],
        set: { url, updatedAt: new Date() },
      });
  }

  return getUserRpcOverrides(userId);
};
