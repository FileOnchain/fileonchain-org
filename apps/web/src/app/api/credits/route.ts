import { NextResponse } from "next/server";
import { requireUser, asRouteError } from "@/lib/auth";
import { getCreditBalance, getLedgerEntries } from "@/lib/server/queries";

/** Balance + recent ledger entries for the signed-in user. */
export async function GET() {
  try {
    const userId = await requireUser();
    const [balance, ledger] = await Promise.all([
      getCreditBalance(userId),
      getLedgerEntries(userId),
    ]);
    return NextResponse.json({
      balanceMicroUsdc: balance.toString(),
      ledger: ledger.map((entry) => ({
        id: entry.id,
        deltaMicroUsdc: entry.deltaMicroUsdc.toString(),
        reason: entry.reason,
        refType: entry.refType,
        refId: entry.refId,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return asRouteError(error);
  }
}
