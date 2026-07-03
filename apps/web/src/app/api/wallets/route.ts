import { NextResponse } from "next/server";
import { requireUser, asRouteError } from "@/lib/auth";
import { getLinkedWallets } from "@/lib/server/queries";

/** Server-verified wallets linked to the signed-in account. */
export async function GET() {
  try {
    const userId = await requireUser();
    const linked = await getLinkedWallets(userId);
    return NextResponse.json({
      wallets: linked.map((wallet) => ({
        family: wallet.family,
        address: wallet.address,
        verifiedAt: wallet.verifiedAt.toISOString(),
      })),
    });
  } catch (error) {
    return asRouteError(error);
  }
}
