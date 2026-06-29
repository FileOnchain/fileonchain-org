import { create } from "zustand";
import { CHAINS, DEFAULT_CHAIN_ID } from "@/lib/chains/registry";
import type { ChainConfig } from "@/lib/chains/registry";
import type { ChainId } from "@/types/types";

interface ChainsState {
  activeChainId: ChainId;
  setActiveChainId: (id: ChainId) => void;
  activeChain: () => ChainConfig;
}

export const useChainsStates = create<ChainsState>((set, get) => ({
  activeChainId: DEFAULT_CHAIN_ID,
  setActiveChainId: (id) => set({ activeChainId: id }),
  activeChain: () => {
    const id = get().activeChainId;
    return CHAINS.find((c) => c.id === id) ?? CHAINS[0];
  },
}));