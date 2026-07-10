"use client";

import { useCallback } from "react";
import { keccak256, stringToBytes } from "viem";
import { cachePaymentsAbi, ZERO_ADDRESS, type ChainConfig } from "@fileonchain/sdk";
import { useCacheStates } from "@/states/cache";
import { useChain } from "@/hooks/useChain";
import { getEvmPublicClient, getEvmWalletClient } from "@/lib/evm/wallet";
import { CACHE_PRICING } from "@/lib/mock/cache";
import type { CacheTier } from "@/lib/mock/cache";
import { trackEvent } from "@/lib/analytics";

/** CachePayments.Tier enum indices. */
const TIER_INDEX: Record<CacheTier, number> = {
  SingleFile: 0,
  Folder: 1,
  Permanent: 2,
};

const TIER_PRICE_GETTER: Record<CacheTier, "priceSingle" | "priceFolder" | "pricePermanent"> = {
  SingleFile: "priceSingle",
  Folder: "priceFolder",
  Permanent: "pricePermanent",
};

type CachePaymentChain = ChainConfig & {
  cacheContract: `0x${string}`;
  usdcContract: `0x${string}`;
};

/**
 * Real cache payments need the CachePayments contract and the USDC token it
 * charges in — both recorded on the chain entry.
 */
export const isCachePaymentProvisioned = (
  chain: ChainConfig,
): chain is CachePaymentChain =>
  chain.family === "evm" &&
  !!chain.cacheContract &&
  chain.cacheContract !== ZERO_ADDRESS &&
  !!chain.usdcContract &&
  chain.usdcContract !== ZERO_ADDRESS;

interface PayArgs {
  fileId: string;
  tier: CacheTier;
}

/**
 * useCachePayment — pays for a private-cache entry. On chains where
 * CachePayments is deployed this sends the real USDC `approve` +
 * `payForCache` transactions through the injected wallet; everywhere else it
 * falls back to the simulated flow so the page stays explorable.
 */
export const useCachePayment = () => {
  const addEntry = useCacheStates((s) => s.addEntry);
  const { activeChain } = useChain();

  const payOnChain = useCallback(
    async ({ fileId, tier }: PayArgs, chain: CachePaymentChain) => {
      const { erc20Abi } = await import("viem");
      const [publicClient, { walletClient, address }] = await Promise.all([
        getEvmPublicClient(chain),
        getEvmWalletClient(chain),
      ]);
      const viemChain = walletClient.chain ?? null;

      // Price comes from the contract, not the marketing table.
      const price = (await publicClient.readContract({
        address: chain.cacheContract,
        abi: cachePaymentsAbi,
        functionName: TIER_PRICE_GETTER[tier],
      })) as bigint;

      const allowance = await publicClient.readContract({
        address: chain.usdcContract,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, chain.cacheContract],
      });
      if (allowance < price) {
        const approveHash = await walletClient.writeContract({
          chain: viemChain,
          account: address,
          address: chain.usdcContract,
          abi: erc20Abi,
          functionName: "approve",
          args: [chain.cacheContract, price],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      const pricing = CACHE_PRICING.find((p) => p.tier === tier)!;
      const durationSeconds = pricing.durationDays
        ? BigInt(pricing.durationDays * 86_400)
        : 0n;
      const txHash = await walletClient.writeContract({
        chain: viemChain,
        account: address,
        address: chain.cacheContract,
        abi: cachePaymentsAbi,
        functionName: "payForCache",
        args: [fileId as `0x${string}`, TIER_INDEX[tier], durationSeconds],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new Error("payForCache transaction reverted");
      }

      return txHash;
    },
    [],
  );

  const pay = useCallback(
    async ({ fileId, tier }: PayArgs) => {
      let txHash: `0x${string}`;
      const pricing = CACHE_PRICING.find((p) => p.tier === tier)!;

      if (isCachePaymentProvisioned(activeChain)) {
        txHash = await payOnChain({ fileId, tier }, activeChain);
      } else {
        // Simulated confirmation — the fallback for chains with nothing
        // deployed, same seam as the upload flow.
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
        txHash = keccak256(stringToBytes(`${fileId}:${tier}:${Date.now()}`));
      }

      const entry = {
        id: fileId as `0x${string}`,
        tier,
        cid: `bafy${fileId.slice(2, 50)}`,
        filename: `entry-${Date.now()}.bin`,
        sizeBytes: 0,
        expiresAt: pricing.durationDays
          ? Math.floor(Date.now() / 1000) + pricing.durationDays * 86_400
          : null,
        allowList: [] as `0x${string}`[],
        txHash,
      };

      addEntry(entry);

      trackEvent("cache_purchase", { tier });

      return { txHash };
    },
    [addEntry, activeChain, payOnChain],
  );

  /**
   * Testnet affordance: the deploy script's MockUSDC has an open `mint`, so
   * users can fund themselves to exercise the real payment flow.
   */
  const mintTestUsdc = useCallback(
    async (amountUsdc: number) => {
      if (!isCachePaymentProvisioned(activeChain) || !activeChain.testnet) {
        throw new Error("Test USDC is only mintable on provisioned testnets.");
      }
      const [publicClient, { walletClient, address }] = await Promise.all([
        getEvmPublicClient(activeChain),
        getEvmWalletClient(activeChain),
      ]);
      const txHash = await walletClient.writeContract({
        chain: walletClient.chain ?? null,
        account: address,
        address: activeChain.usdcContract,
        abi: [
          {
            type: "function",
            name: "mint",
            stateMutability: "nonpayable",
            inputs: [
              { name: "to", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [],
          },
        ] as const,
        functionName: "mint",
        args: [address, BigInt(Math.round(amountUsdc * 1_000_000))],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash };
    },
    [activeChain],
  );

  return {
    pay,
    mintTestUsdc,
    /** True when the active chain settles cache payments on-chain. */
    onchainReady: isCachePaymentProvisioned(activeChain),
    activeChain,
  };
};
