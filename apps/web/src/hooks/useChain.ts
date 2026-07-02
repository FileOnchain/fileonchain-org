"use client";

import { useChainsStates } from "@/states/chains";
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

  const activeChain = activeChainId ? (getChain(activeChainId) ?? (getChain("substrate:autonomys-mainnet")!)) : (getChain("substrate:autonomys-mainnet")!);

  return {
    activeChainId,
    activeChain,
    setActiveChainId,
    getChainById: (id) => getChain(id),
  };
};

export default useChain;