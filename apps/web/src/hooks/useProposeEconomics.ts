"use client";

import * as React from "react";
import { formatEther } from "viem";
import {
  fileRegistryAbi,
  isProposeProvisioned,
  type ChainConfig,
} from "@fileonchain/sdk";
import { getEvmPublicClient } from "@/lib/evm/wallet";
import { ANCHOR_ESCROW } from "@/lib/focat";

export interface ProposeEconomics {
  /** FOCAT escrowed as the anchor tip (kept, split 60/25/15). */
  tipFocat: number;
  /** FOCAT escrowed as the propose bond (returned after verification). */
  bondFocat: number;
  /** True once the values were read from the chain's FileRegistry. */
  live: boolean;
}

const DEFAULTS: ProposeEconomics = {
  tipFocat: ANCHOR_ESCROW.tipFocat,
  bondFocat: ANCHOR_ESCROW.bondFocat,
  live: false,
};

/**
 * useProposeEconomics — the real minTip / proposeBond a paid anchor will
 * escrow, read from the chain's FileRegistry when it is propose-provisioned
 * (the same values `proposeAnchor` uses on send). Falls back to the
 * documented defaults everywhere else.
 */
export const useProposeEconomics = (chain: ChainConfig): ProposeEconomics => {
  const [economics, setEconomics] = React.useState<ProposeEconomics>(DEFAULTS);

  React.useEffect(() => {
    setEconomics(DEFAULTS);
    if (chain.family !== "evm" || !isProposeProvisioned(chain)) return;
    let cancelled = false;
    (async () => {
      try {
        const client = await getEvmPublicClient(chain);
        const registry = chain.registryContract as `0x${string}`;
        const [minTip, proposeBond] = await Promise.all([
          client.readContract({
            address: registry,
            abi: fileRegistryAbi,
            functionName: "minTip",
          }) as Promise<bigint>,
          client.readContract({
            address: registry,
            abi: fileRegistryAbi,
            functionName: "proposeBond",
          }) as Promise<bigint>,
        ]);
        if (cancelled) return;
        setEconomics({
          tipFocat: Number(formatEther(minTip)),
          bondFocat: Number(formatEther(proposeBond)),
          live: true,
        });
      } catch {
        // Keep the defaults — economics display is advisory.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chain]);

  return economics;
};

export default useProposeEconomics;
