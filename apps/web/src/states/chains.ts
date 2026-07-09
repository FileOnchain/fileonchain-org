import { create } from "zustand";
import {
  CHAINS,
  DEFAULT_CHAIN_ID,
  getChain,
  isChainActive,
  type ChainConfig,
  type ChainId,
} from "@fileonchain/sdk";

const ACTIVE_CHAIN_STORAGE_KEY = "fileonchain-active-chain";

interface ChainsState {
  activeChainId: ChainId;
  setActiveChainId: (id: ChainId) => void;
  activeChain: () => ChainConfig;
}

export const useChainsStates = create<ChainsState>((set, get) => ({
  activeChainId: DEFAULT_CHAIN_ID,
  setActiveChainId: (id) => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(ACTIVE_CHAIN_STORAGE_KEY, id);
      } catch {
        // Storage unavailable — the selection just won't survive a refresh.
      }
    }
    set({ activeChainId: id });
  },
  activeChain: () => {
    const id = get().activeChainId;
    return CHAINS.find((c) => c.id === id) ?? CHAINS[0];
  },
}));

// Restore the picked chain after mount so SSR markup stays deterministic —
// same pattern as states/theme.ts. Session-scoped on purpose: it protects
// the selection across the "new version" refresh without pinning it forever.
let activeChainHydrated = false;
export const hydrateActiveChain = () => {
  if (typeof window === "undefined" || activeChainHydrated) return;
  activeChainHydrated = true;
  try {
    const stored = window.sessionStorage.getItem(ACTIVE_CHAIN_STORAGE_KEY);
    const chain = stored ? getChain(stored as ChainId) : undefined;
    // Ignore selections whose chain has since left "active" — uploads
    // must never start on a planned/deprecated chain.
    if (chain && isChainActive(chain)) {
      useChainsStates.setState({ activeChainId: chain.id });
    }
  } catch {
    // Storage unavailable — keep the default chain.
  }
};
