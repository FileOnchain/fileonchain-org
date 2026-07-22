import { NextResponse } from "next/server";
import { keccak256, stringToBytes } from "viem";
import { hdKeyToAccount, mnemonicToAccount } from "viem/accounts";
import { ZERO_ADDRESS, getChain, type ChainId } from "@fileonchain/sdk";
import { db, deposits } from "@/lib/db";
import { requireUser, asRouteError } from "@/lib/auth";
import { usdcToMicro } from "@/lib/usdc";
import { env } from "@/lib/env";

const MAX_DEPOSIT_USDC = 10_000;

/**
 * Create a pending USDC deposit intent.
 *
 * The user is shown a real, monitorable EVM deposit address that the
 * FileOnChain treasury controls. The address is derived from a BIP-39
 * treasury mnemonic at
 *   m/44'/60'/0'/0/<hashed(userId)>'/0/0
 * so each user has a stable, deterministic address — a second deposit
 * intent from the same user returns the same address, and the treasury
 * operator sweeps incoming USDC into a hot wallet.
 *
 * The existing `Transfer`-event watcher (`/api/cron/deposits-watch` →
 * `lib/server/deposits.ts`) and the manual confirm route
 * (`/api/credits/deposit/[id]/confirm`) filter by `deposits.deposit_address`
 * — no changes needed there. The `deposits.tx_hash` unique index still
 * defends against the manual+watcher race.
 *
 * Deposits are EVM-only today (USDC is an ERC-20); non-EVM chain
 * selections are rejected at the route layer with 400 so we never store
 * a meaningless EVM-shaped address against a non-EVM row.
 */

/** Hash the userId into a 31-bit derivation index (avoids rare path overflow). */
const deriveUserIndex = (userId: string): number =>
  Number(
    BigInt(keccak256(stringToBytes(`deposit-idx:${userId}`)).slice(0, 8)) %
      BigInt(2 ** 31),
  );

const deriveDepositAddress = (userId: string): `0x${string}` => {
  const mnemonic = env.depositTreasuryMnemonic;
  if (!mnemonic) {
    throw new Error("DEPOSIT_TREASURY_MNEMONIC unset — configure the treasury seed first");
  }
  const root = mnemonicToAccount(mnemonic.trim(), { accountIndex: 0, change: 0 });
  return hdKeyToAccount(
    root.getHdKey(),
    `m/44'/60'/${deriveUserIndex(userId)}'/0/0`,
  ).address;
};

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
    // USDC is an ERC-20 — deposits require an EVM chain with a verifiable
    // MockUSDC deployment. Reject anything else here so the row never
    // stores a meaningless EVM-shaped address against a non-EVM chain.
    if (chain.family !== "evm" || !chain.usdcContract || chain.usdcContract === ZERO_ADDRESS) {
      return NextResponse.json(
        { error: "This chain does not support USDC deposits" },
        { status: 400 },
      );
    }

    let depositAddress: `0x${string}`;
    try {
      depositAddress = deriveDepositAddress(userId);
    } catch (error) {
      // Missing treasury seed is an ops misconfiguration, not a user error.
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Deposit service is not configured",
        },
        { status: 503 },
      );
    }

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
