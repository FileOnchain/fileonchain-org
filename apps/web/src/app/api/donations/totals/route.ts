import { NextResponse } from "next/server";
import { getChainDonationTotals } from "@/lib/server/donations";

export const dynamic = "force-dynamic";

/**
 * `GET /api/donations/totals` — cumulative PerChain donation totals
 * per provisioned EVM chain from `DonationEscrow.chainDonationTotal`.
 * Powers `DonationChainTotalsStrip` on `/donations`.
 *
 * Public on purpose — totals are aggregate network state, not user
 * state. Failing to require auth keeps logged-out visitors on the
 * live numbers instead of falling back to the seeded feed.
 *
 * Per-chain read failures resolve to that chain being absent from
 * the returned map (no fabricated zero rows).
 */
export async function GET() {
  try {
    const totals = await getChainDonationTotals();
    return NextResponse.json({ totals });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "donation totals unavailable" },
      { status: 502 },
    );
  }
}