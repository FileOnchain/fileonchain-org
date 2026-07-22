import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, wallets } from "@/lib/db";
import { requireUser, asRouteError } from "@/lib/auth";
import { getUserCacheEntries } from "@/lib/server/cache";

export const dynamic = "force-dynamic";

/**
 * `GET /api/cache/entries` — returns the authenticated user's real
 * `CachePayments` entries across every provisioned EVM chain. Used by
 * the `/cache` page to hydrate `useCacheStates`; the route is also
 * available to the dashboard's cache widget.
 *
 * The user's primary wallet address (lowercased) is what the contract
 * filter uses — see the `CachePaid(payer, …)` filter in
 * `lib/server/cache.ts`. A user without any wallet row receives an
 * empty list, matching the explorer/indexer "fail open" pattern.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const [primary] = await db
      .select({ address: wallets.address })
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);

    if (!primary) {
      return NextResponse.json({ entries: [] });
    }

    const entries = await getUserCacheEntries(
      primary.address.toLowerCase() as `0x${string}`,
    );
    return NextResponse.json({ entries });
  } catch (error) {
    return asRouteError(error);
  }
}
