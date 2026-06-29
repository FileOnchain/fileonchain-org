"use client";

import { useCallback } from "react";
import { keccak256, stringToBytes } from "viem";
import { useCacheStates } from "@/states/cache";
import { CACHE_PRICING } from "@/lib/mock/cache";
import type { CacheTier } from "@/lib/mock/cache";

/* TODO: real wagmi/viem writeContract call to CachePayments.payForCache */

interface PayArgs {
  fileId: string;
  tier: CacheTier;
}

export const useCachePayment = () => {
  const addEntry = useCacheStates((s) => s.addEntry);

  const pay = useCallback(
    async ({ fileId, tier }: PayArgs) => {
      // Simulate tx confirmation.
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));

      const txHash = keccak256(stringToBytes(`${fileId}:${tier}:${Date.now()}`));
      const pricing = CACHE_PRICING.find((p) => p.tier === tier)!;

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

      return { txHash };
    },
    [addEntry],
  );

  return { pay };
};