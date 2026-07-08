import { NextResponse } from "next/server";
import type { ChainId } from "@fileonchain/sdk";
import { requireUser, asRouteError } from "@/lib/auth";
import {
  createFocatOrder,
  listFocatOrders,
  serializeFocatOrder,
  FocatOrderError,
} from "@/lib/server/focat-orders";
import type { FocatPackId } from "@/lib/focat";

/**
 * FOCAT anchor packs for the pay-as-you-go wallet path. Mainnet packs are
 * fixed-price and paid from account credits; testnet chains drip from a
 * free faucet instead. Credits/API anchoring never needs this — the server
 * worker holds the FOCAT.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUser();
    const body = (await request.json().catch(() => null)) as {
      chainId?: string;
      packId?: string;
      walletAddress?: string;
      customFocat?: number;
    } | null;

    if (!body?.chainId || !body.walletAddress) {
      return NextResponse.json(
        { error: "Expected { chainId, packId, walletAddress, customFocat? }" },
        { status: 400 },
      );
    }

    const order = await createFocatOrder(userId, {
      chainId: body.chainId as ChainId,
      packId: (body.packId ?? "anchor-pack") as FocatPackId,
      walletAddress: body.walletAddress,
      customFocat: body.customFocat,
    });
    return NextResponse.json({ order: serializeFocatOrder(order) });
  } catch (error) {
    if (error instanceof FocatOrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return asRouteError(error);
  }
}

export async function GET() {
  try {
    const userId = await requireUser();
    const orders = await listFocatOrders(userId);
    return NextResponse.json({ orders: orders.map(serializeFocatOrder) });
  } catch (error) {
    return asRouteError(error);
  }
}
