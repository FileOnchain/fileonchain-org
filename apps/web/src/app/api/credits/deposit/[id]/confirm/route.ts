import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { keccak256, stringToBytes } from "viem";
import { getChain, ZERO_ADDRESS, type ChainConfig } from "@fileonchain/sdk";
import { db, deposits } from "@/lib/db";
import { requireUser, asRouteError } from "@/lib/auth";
import { creditAccount } from "@/lib/server/credits";
import { logActivity } from "@/lib/server/activity";
import { microToUsdc } from "@/lib/usdc";

/**
 * Confirm a pending USDC deposit.
 *
 * On chains whose USDC token is recorded in the registry (`usdcContract` —
 * the deployed MockUSDC on testnets), confirmation is verified on-chain:
 * the client submits the transfer's tx hash and the route checks the
 * receipt carries a USDC Transfer to the deposit address covering the
 * declared amount. Chains without a verifiable token keep the mock seam
 * (deterministic fake hash, client's word). TODO: replace the mock branch
 * with a Transfer watcher / permit2 pull as more chains provision.
 */

const isVerifiable = (
  chain: ChainConfig | undefined,
): chain is ChainConfig & { usdcContract: `0x${string}` } =>
  !!chain &&
  chain.family === "evm" &&
  !!chain.usdcContract &&
  chain.usdcContract !== ZERO_ADDRESS;

class DepositVerifyError extends Error {}

/** Throws DepositVerifyError unless `txHash` is a USDC transfer covering the deposit. */
const verifyUsdcTransfer = async (
  chain: ChainConfig & { usdcContract: `0x${string}` },
  txHash: `0x${string}`,
  depositAddress: string,
  amountMicroUsdc: bigint,
) => {
  const [{ createPublicClient, http, parseEventLogs, erc20Abi }, { toViemChain }] =
    await Promise.all([import("viem"), import("@fileonchain/sdk/evm")]);
  const client = createPublicClient({
    chain: toViemChain(chain),
    transport: http(chain.rpcUrl),
  });

  const receipt = await client
    .getTransactionReceipt({ hash: txHash })
    .catch(() => null);
  if (!receipt) {
    throw new DepositVerifyError("Transaction not found on the deposit chain");
  }
  if (receipt.status !== "success") {
    throw new DepositVerifyError("The referenced transaction reverted");
  }

  const transfers = parseEventLogs({
    abi: erc20Abi,
    eventName: "Transfer",
    logs: receipt.logs,
  }).filter((log) => log.address.toLowerCase() === chain.usdcContract.toLowerCase());

  const match = transfers.find(
    (log) =>
      log.args.to.toLowerCase() === depositAddress.toLowerCase() &&
      log.args.value >= amountMicroUsdc,
  );
  if (!match) {
    throw new DepositVerifyError(
      "No USDC transfer to the deposit address covering the amount was found in that transaction",
    );
  }
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { txHash?: string };

    const [pending] = await db
      .select()
      .from(deposits)
      .where(
        and(eq(deposits.id, id), eq(deposits.userId, userId), eq(deposits.status, "pending")),
      );
    if (!pending) {
      return NextResponse.json(
        { error: "Deposit not found or already processed" },
        { status: 404 },
      );
    }

    const chain = getChain(pending.chainId);
    let txHash: string;

    if (isVerifiable(chain)) {
      if (!body.txHash || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) {
        return NextResponse.json(
          { error: "This chain verifies deposits on-chain — provide the USDC transfer tx hash" },
          { status: 400 },
        );
      }
      // One tx confirms one deposit: block replaying a hash another deposit
      // already claimed.
      const [claimed] = await db
        .select({ id: deposits.id })
        .from(deposits)
        .where(eq(deposits.txHash, body.txHash));
      if (claimed) {
        return NextResponse.json(
          { error: "That transaction already confirmed a deposit" },
          { status: 409 },
        );
      }
      try {
        await verifyUsdcTransfer(
          chain,
          body.txHash as `0x${string}`,
          pending.depositAddress,
          pending.amountMicroUsdc,
        );
      } catch (error) {
        if (error instanceof DepositVerifyError) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
      txHash = body.txHash;
    } else {
      // Mock seam — chains without a recorded USDC token.
      txHash = keccak256(stringToBytes(`fileonchain-deposit-tx:${id}`));
    }

    // Guarded update: only the owner's still-pending deposit can confirm,
    // so replaying the request cannot double-credit.
    const [deposit] = await db
      .update(deposits)
      .set({ status: "confirmed", confirmedAt: new Date(), txHash })
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
