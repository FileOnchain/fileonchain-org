import "server-only";
import { desc, eq } from "drizzle-orm";
import { keccak256, stringToBytes } from "viem";
import { getChain, type ChainId } from "@fileonchain/sdk";
import { db, focatOrders } from "@/lib/db";
import {
  getFocatPack,
  isProtocolChain,
  packPriceUsd,
  MAX_CUSTOM_FOCAT,
  type FocatPackId,
} from "@/lib/focat";
import { debitCredits, InsufficientCreditsError } from "@/lib/server/credits";
import { logActivity } from "@/lib/server/activity";
import { usdcToMicro } from "@/lib/usdc";

export class FocatOrderError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "FocatOrderError";
  }
}

export interface FocatOrderRequest {
  chainId: ChainId;
  packId: FocatPackId;
  walletAddress: string;
  /** Whole FOCAT; only read when packId is "custom". */
  customFocat?: number;
}

/** One faucet drip covers one propose (tip + bond + buffer). */
const FAUCET_DRIP_FOCAT = 110;

/**
 * Sell a fixed-price FOCAT pack (mainnet, paid from account credits) or
 * drip from the faucet (testnet, free — never mixed with the sale). The
 * treasury transfer to the user's wallet on the target chain is a mock
 * seam. TODO: transfer FOCAT from the chain's funded treasury signer
 * (ANCHOR_* keys) and record the real tx hash; fund each spoke treasury
 * from the home-chain allocation via approved bridges.
 */
export const createFocatOrder = async (userId: string, request: FocatOrderRequest) => {
  const chain = getChain(request.chainId);
  if (!chain || !isProtocolChain(chain)) {
    throw new FocatOrderError(
      "FOCAT packs exist only on propose/verify chains (EVM, Aptos, Sui, Starknet, NEAR)",
    );
  }
  if (typeof request.walletAddress !== "string" || request.walletAddress.length < 4) {
    throw new FocatOrderError("walletAddress is required — connect the wallet that will anchor");
  }

  let focatAmount: number;
  let priceMicroUsdc: bigint;
  let pack: (typeof focatOrders.$inferInsert)["pack"];

  if (chain.testnet) {
    // Testnet: faucet only. Free drip for QA; no sale UI, no credits spent.
    pack = "faucet";
    focatAmount = FAUCET_DRIP_FOCAT;
    priceMicroUsdc = 0n;
  } else {
    const catalogPack = getFocatPack(request.packId);
    pack = catalogPack.id;
    if (catalogPack.focatAmount !== null) {
      focatAmount = catalogPack.focatAmount;
    } else {
      const custom = request.customFocat;
      if (
        typeof custom !== "number" ||
        !Number.isInteger(custom) ||
        custom <= 0 ||
        custom > MAX_CUSTOM_FOCAT
      ) {
        throw new FocatOrderError(`customFocat must be an integer in [1, ${MAX_CUSTOM_FOCAT}]`);
      }
      focatAmount = custom;
    }
    priceMicroUsdc = usdcToMicro(packPriceUsd(focatAmount));
  }

  // Deterministic mock transfer hash — replaced by the real treasury send.
  const txHash = keccak256(
    stringToBytes(`fileonchain-focat:${userId}:${chain.id}:${request.walletAddress}:${Date.now()}`),
  );

  const [order] = await db
    .insert(focatOrders)
    .values({
      userId,
      chainId: chain.id,
      walletAddress: request.walletAddress,
      pack,
      focatAmount,
      priceMicroUsdc,
      txHash,
    })
    .returning();

  if (priceMicroUsdc > 0n) {
    try {
      await debitCredits(userId, priceMicroUsdc, "focat_pack", {
        type: "focat_order",
        id: order.id,
      });
    } catch (error) {
      await db
        .update(focatOrders)
        .set({ status: "failed" })
        .where(eq(focatOrders.id, order.id));
      if (error instanceof InsufficientCreditsError) {
        throw new FocatOrderError("Insufficient credits — top up on the Credits tab", 402);
      }
      throw error;
    }
  }

  await logActivity(userId, "focat_pack_purchase", {
    orderId: order.id,
    chainId: chain.id,
    pack,
    focatAmount,
    priceMicroUsdc: priceMicroUsdc.toString(),
  });

  return order;
};

export const listFocatOrders = async (userId: string) =>
  db
    .select()
    .from(focatOrders)
    .where(eq(focatOrders.userId, userId))
    .orderBy(desc(focatOrders.createdAt))
    .limit(50);

export const serializeFocatOrder = (order: typeof focatOrders.$inferSelect) => ({
  id: order.id,
  chainId: order.chainId,
  walletAddress: order.walletAddress,
  pack: order.pack,
  focatAmount: order.focatAmount,
  priceMicroUsdc: order.priceMicroUsdc.toString(),
  status: order.status,
  txHash: order.txHash,
  createdAt: order.createdAt.toISOString(),
});
