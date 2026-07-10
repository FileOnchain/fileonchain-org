import "server-only";
import { desc, eq } from "drizzle-orm";
import { keccak256, stringToBytes } from "viem";
import {
  fileOnChainAttestationTokenAbi,
  getChain,
  isProposeProvisioned,
  type ChainConfig,
  type ChainId,
} from "@fileonchain/sdk";
import { db, focatOrders } from "@/lib/db";
import { env } from "@/lib/env";
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
 * Real fulfillment: transfer FOCAT from the server signer's wallet on
 * propose-provisioned EVM chains. Returns null when the chain can't do a
 * real send (other family, nothing deployed, or no ANCHOR_EVM_PRIVATE_KEY)
 * so the caller falls back to the mock seam. The signer must hold FOCAT on
 * the chain — on testnets that's the deployer, which minted the supply.
 */
const sendFocatOnEvm = async (
  chain: ChainConfig,
  walletAddress: string,
  focatAmount: number,
): Promise<`0x${string}` | null> => {
  const privateKey = env.anchorEvmPrivateKey;
  if (chain.family !== "evm" || !isProposeProvisioned(chain) || !privateKey) {
    return null;
  }
  const [
    { createPublicClient, createWalletClient, http, isAddress, parseEther },
    { privateKeyToAccount },
    evm,
  ] = await Promise.all([
    import("viem"),
    import("viem/accounts"),
    import("@fileonchain/sdk/evm"),
  ]);
  if (!isAddress(walletAddress)) {
    throw new FocatOrderError("walletAddress must be a valid EVM address on this chain");
  }
  const viemChain = evm.toViemChain(chain);
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: viemChain,
    transport: http(chain.rpcUrl),
  });
  const txHash = await walletClient.writeContract({
    address: chain.tokenContract as `0x${string}`,
    abi: fileOnChainAttestationTokenAbi,
    functionName: "transfer",
    args: [walletAddress, parseEther(String(focatAmount))],
  });
  const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new FocatOrderError("FOCAT transfer reverted on-chain", 502);
  }
  return txHash;
};

/**
 * Sell a fixed-price FOCAT pack (mainnet, paid from account credits) or
 * drip from the faucet (testnet, free — never mixed with the sale). On
 * propose-provisioned EVM chains with a funded ANCHOR_EVM_PRIVATE_KEY the
 * transfer to the user's wallet is a real FOCAT send; elsewhere it stays
 * the mock seam. TODO for the remaining families: transfer from their
 * ANCHOR_* signers, and fund spoke treasuries via approved bridges.
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

  // Real treasury send where the chain + signer support it; deterministic
  // mock hash otherwise. The send precedes the credit debit — safe today
  // because real sends only happen on testnets, where packs are free; when
  // a mainnet provisions, move the debit ahead of the transfer.
  let txHash: `0x${string}`;
  try {
    txHash =
      (await sendFocatOnEvm(chain, request.walletAddress, focatAmount)) ??
      keccak256(
        stringToBytes(
          `fileonchain-focat:${userId}:${chain.id}:${request.walletAddress}:${Date.now()}`,
        ),
      );
  } catch (error) {
    if (error instanceof FocatOrderError) throw error;
    throw new FocatOrderError(
      `FOCAT transfer failed: ${error instanceof Error ? error.message : "unknown error"}`,
      502,
    );
  }

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
