import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { keccak256, stringToBytes } from "viem";
import { db, deposits } from "@/lib/db";
import { requireUser, asRouteError } from "@/lib/auth";
import { creditAccount } from "@/lib/server/credits";
import { logActivity } from "@/lib/server/activity";
import { microToUsdc } from "@/lib/usdc";

/**
 * MOCK SEAM — simulate onchain deposit detection. Marks the deposit
 * confirmed with a deterministic fake tx hash and credits the ledger.
 *
 * TODO: replace with a USDC Transfer-event watcher (or permit2 pull) that
 * confirms deposits from chain data instead of trusting the client's word.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;

    // Guarded update: only the owner's still-pending deposit can confirm,
    // so replaying the request cannot double-credit.
    const [deposit] = await db
      .update(deposits)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
        txHash: keccak256(stringToBytes(`fileonchain-deposit-tx:${id}`)),
      })
      .where(
        and(
          eq(deposits.id, id),
          eq(deposits.userId, userId),
          eq(deposits.status, "pending"),
        ),
      )
      .returning();
    if (!deposit) {
      return NextResponse.json(
        { error: "Deposit not found or already processed" },
        { status: 404 },
      );
    }

    await creditAccount(userId, deposit.amountMicroUsdc, "deposit", {
      type: "deposit",
      id: deposit.id,
    });
    await logActivity(userId, "credit_deposit", {
      depositId: deposit.id,
      chainId: deposit.chainId,
      amountUsdc: microToUsdc(deposit.amountMicroUsdc),
      txHash: deposit.txHash,
    });

    return NextResponse.json({
      id: deposit.id,
      status: deposit.status,
      txHash: deposit.txHash,
      amountMicroUsdc: deposit.amountMicroUsdc.toString(),
    });
  } catch (error) {
    return asRouteError(error);
  }
}
