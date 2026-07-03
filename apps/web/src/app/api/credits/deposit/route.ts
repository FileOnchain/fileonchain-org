import { NextResponse } from "next/server";
import { keccak256, stringToBytes } from "viem";
import { getChain, type ChainId } from "@fileonchain/sdk";
import { db, deposits } from "@/lib/db";
import { requireUser, asRouteError } from "@/lib/auth";
import { usdcToMicro } from "@/lib/usdc";

const MAX_DEPOSIT_USDC = 10_000;

/**
 * Create a pending USDC deposit intent: the user is shown a deposit address
 * for the chosen chain and confirms after sending.
 *
 * The address is a deterministic mock. TODO: wire to a real per-user deposit
 * address (or a permit2/transferFrom flow) plus an onchain USDC
 * Transfer-event watcher that confirms deposits automatically.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUser();
    const body = (await request.json().catch(() => null)) as {
      chainId?: string;
      amountUsdc?: number;
    } | null;

    const chain = body?.chainId ? getChain(body.chainId as ChainId) : undefined;
    const amountUsdc = body?.amountUsdc;
    if (
      !chain ||
      typeof amountUsdc !== "number" ||
      !Number.isFinite(amountUsdc) ||
      amountUsdc <= 0 ||
      amountUsdc > MAX_DEPOSIT_USDC
    ) {
      return NextResponse.json(
        { error: `Expected { chainId, amountUsdc (0–${MAX_DEPOSIT_USDC}] }` },
        { status: 400 },
      );
    }

    const depositAddress = `0x${keccak256(
      stringToBytes(`fileonchain-deposit:${userId}:${chain.id}`),
    ).slice(2, 42)}`;

    const [deposit] = await db
      .insert(deposits)
      .values({
        userId,
        chainId: chain.id,
        amountMicroUsdc: usdcToMicro(amountUsdc),
        depositAddress,
      })
      .returning();

    return NextResponse.json({
      id: deposit.id,
      chainId: deposit.chainId,
      amountMicroUsdc: deposit.amountMicroUsdc.toString(),
      depositAddress: deposit.depositAddress,
      status: deposit.status,
    });
  } catch (error) {
    return asRouteError(error);
  }
}
