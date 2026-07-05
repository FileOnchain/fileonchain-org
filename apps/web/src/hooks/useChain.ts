"use client";

import * as React from "react";
import { hydrateActiveChain, useChainsStates } from "@/states/chains";
import { getChain, type ChainConfig, type ChainId } from "@fileonchain/sdk";

/**
 * useChain — convenience hook around the chains store. Returns the active
 * chain config plus the registry helpers. Re-renders only when the active
 * chain id changes.
 */
export const useChain = (): {
  activeChainId: ChainId;
  activeChain: ChainConfig;
  setActiveChainId: (id: ChainId) => void;
  getChainById: (id: ChainId) => ChainConfig | undefined;
} => {
  const activeChainId = useChainsStates((s) => s.activeChainId);
  const setActiveChainId = useChainsStates((s) => s.setActiveChainId);

  // Post-mount, once per session — restores the selection after a refresh
  // without desyncing SSR markup (idempotent, guarded in the store).
  React.useEffect(() => {
    hydrateActiveChain();
  }, []);

  const activeChain = activeChainId ? (getChain(activeChainId) ?? (getChain("substrate:autonomys-mainnet")!)) : (getChain("substrate:autonomys-mainnet")!);

  return {
    activeChainId,
    activeChain,
    setActiveChainId,
    getChainById: (id) => getChain(id),
  };
};

export default useChain;