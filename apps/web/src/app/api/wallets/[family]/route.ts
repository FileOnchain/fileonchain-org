import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, wallets } from "@/lib/db";
import { requireUser, asRouteError } from "@/lib/auth";
import { isWalletFamily } from "@/lib/auth/wallet-message";
import { logActivity } from "@/lib/server/activity";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ family: string }> },
) {
  try {
    const userId = await requireUser();
    const { family } = await params;
    if (!isWalletFamily(family)) {
      return NextResponse.json({ error: "Unknown family" }, { status: 400 });
    }
    const [removed] = await db
      .delete(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.family, family)))
      .returning();
    if (!removed) {
      return NextResponse.json(
        { error: "No linked wallet for this family" },
        { status: 404 },
      );
    }
    await logActivity(userId, "wallet_unlinked", {
      family,
      address: removed.address,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return asRouteError(error);
  }
}
