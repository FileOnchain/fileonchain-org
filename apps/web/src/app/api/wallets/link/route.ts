import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db, wallets } from "@/lib/db";
import { requireUser, asRouteError } from "@/lib/auth";
import { isWalletFamily } from "@/lib/auth/wallet-message";
import { verifyWalletSignature } from "@/lib/auth/verify-wallet";
import { logActivity } from "@/lib/server/activity";

/**
 * Attach a wallet to the signed-in account with the same nonce+signature
 * proof as wallet sign-in. One wallet per family (relinking replaces), and
 * an address verified into another account returns 409.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUser();
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const { family, address, signature, nonce, publicKey, fullMessage } =
      body ?? {};
    if (
      !isWalletFamily(family) ||
      typeof address !== "string" ||
      typeof signature !== "string" ||
      typeof nonce !== "string"
    ) {
      return NextResponse.json(
        { error: "Expected { family, address, signature, nonce }" },
        { status: 400 },
      );
    }

    const result = await verifyWalletSignature({
      family,
      address,
      signature,
      nonce,
      publicKey: typeof publicKey === "string" ? publicKey : undefined,
      fullMessage: typeof fullMessage === "string" ? fullMessage : undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const [ownedElsewhere] = await db
      .select({ userId: wallets.userId })
      .from(wallets)
      .where(
        and(
          eq(wallets.family, family),
          eq(wallets.address, result.address),
          ne(wallets.userId, userId),
        ),
      )
      .limit(1);
    if (ownedElsewhere) {
      return NextResponse.json(
        { error: "This wallet is already linked to another account" },
        { status: 409 },
      );
    }

    // One wallet per family — relinking replaces the previous entry, the
    // same invariant useIdentityStates enforces client-side.
    const linked = await db.transaction(async (tx) => {
      await tx
        .delete(wallets)
        .where(and(eq(wallets.userId, userId), eq(wallets.family, family)));
      const [row] = await tx
        .insert(wallets)
        .values({
          userId,
          family,
          address: result.address,
          publicKey: typeof publicKey === "string" ? publicKey : null,
          signature,
          message: result.message,
        })
        .returning();
      return row;
    });

    await logActivity(userId, "wallet_linked", {
      family,
      address: linked.address,
      via: "link",
    });
    return NextResponse.json({
      wallet: {
        family: linked.family,
        address: linked.address,
        verifiedAt: linked.verifiedAt.toISOString(),
      },
    });
  } catch (error) {
    return asRouteError(error);
  }
}
