import { NextResponse } from "next/server";
import { requireUser, asRouteError } from "@/lib/auth";
import { getRecentDonations } from "@/lib/server/donations";

export const dynamic = "force-dynamic";

/**
 * `GET /api/donations/recent?limit=20` — returns the most recent
 * `Donated` events across every provisioned EVM chain. Used by the
 * `/donations` page to hydrate `useDonationsStates`.
 *
 * `limit` is bounded to 100 rows to keep the fan-out bounded — the
 * underlying `getRecentDonations` reads a 200k-block lookback per
 * provisioned chain.
 */
export async function GET(request: Request) {
  try {
    await requireUser();
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(100, Math.floor(limitParam)))
      : 20;
    const donations = await getRecentDonations(limit);
    return NextResponse.json({ donations });
  } catch (error) {
    return asRouteError(error);
  }
}
