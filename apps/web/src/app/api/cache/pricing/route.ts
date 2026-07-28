import { NextResponse } from "next/server";
import { getCachePricing } from "@/lib/server/cache";

export const dynamic = "force-dynamic";

/**
 * `GET /api/cache/pricing` — live `CachePayments` pricing + treasury
 * for every provisioned EVM chain. Powers the cache pricing table on
 * `/cache` and is the single source the donations page reuses for the
 * per-chain treasury address (`DonationEscrow` forwards to the same
 * address as `CachePayments.treasury()` on Sepolia + Chronos).
 *
 * Public on purpose — pricing is chain-defined product metadata, not
 * user state. Failing to require auth keeps logged-out visitors on the
 * live numbers instead of falling back to the marketing table.
 *
 * Read errors per chain resolve to that chain being absent from the
 * returned map (no fabricated zero rows).
 */
export async function GET() {
  try {
    const pricing = await getCachePricing();
    return NextResponse.json({ pricing });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "cache pricing unavailable" },
      { status: 502 },
    );
  }
}