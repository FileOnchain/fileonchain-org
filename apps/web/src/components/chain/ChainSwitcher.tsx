"use client";

import * as React from "react";
import { ChainSelect } from "@/components/chain/ChainSelect";
import { useChain } from "@/hooks/useChain";
import { useVisibleChains } from "@/hooks/useVisibleChains";

interface ChainSwitcherProps {
  variant?: "compact" | "full";
}

/**
 * ChainSwitcher — the Nav's searchable network picker. Picking a chain
 * writes it to the active-chain store, which then drives the wallet modal
 * and any cost estimate surfaces. Rendering lives in ChainSelect.
 */
export const ChainSwitcher = ({ variant = "full" }: ChainSwitcherProps) => {
  const { activeChain, setActiveChainId } = useChain();
  const visibleChains = useVisibleChains();

  return (
    <ChainSelect
      chains={visibleChains}
      value={activeChain.id}
      onValueChange={setActiveChainId}
      variant={variant === "compact" ? "header-compact" : "header"}
      // The active chain feeds the upload flow — planned/deprecated chains
      // stay visible (with their status badge) but can't be picked.
      restrictToActive
      ariaLabel="Switch active chain"
    />
  );
};

export default ChainSwitcher;
