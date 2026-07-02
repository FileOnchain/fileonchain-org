import { create } from "zustand";
import type { ChainFamily } from "@fileonchain/sdk";
import type { LinkedWallet } from "@/lib/mock/profiles";

const IDENTITY_STORAGE_KEY = "fileonchain-linked-wallets";

/* TODO: replace localStorage persistence with the onchain identity registry —
 * a link should be a signed attestation from both wallets, and this store
 * should only cache what the registry reports for the connected address. */

interface IdentityState {
  /** Wallets the connected user has linked, keyed one per runtime family. */
  linked: LinkedWallet[];
  /** True once localStorage has been read on the client. */
  hydrated: boolean;
  linkWallet: (wallet: LinkedWallet) => void;
  unlinkWallet: (family: ChainFamily) => void;
  clear: () => void;
}

const persist = (linked: LinkedWallet[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(linked));
};

export const useIdentityStates = create<IdentityState>((set, get) => ({
  linked: [],
  hydrated: false,
  linkWallet: (wallet) => {
    // One wallet per family — relinking a family replaces the previous entry.
    const linked = [
      ...get().linked.filter((w) => w.family !== wallet.family),
      wallet,
    ];
    persist(linked);
    set({ linked });
  },
  unlinkWallet: (family) => {
    const linked = get().linked.filter((w) => w.family !== family);
    persist(linked);
    set({ linked });
  },
  clear: () => {
    persist([]);
    set({ linked: [] });
  },
}));

/**
 * Hydrate from localStorage after mount so SSR markup stays deterministic —
 * same pattern as `hydrateTheme`. Call once from the client component that
 * renders linked wallets.
 */
export const hydrateIdentity = () => {
  if (typeof window === "undefined") return;
  let linked: LinkedWallet[] = [];
  try {
    const raw = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        linked = parsed.filter(
          (w): w is LinkedWallet =>
            typeof w === "object" &&
            w !== null &&
            typeof (w as LinkedWallet).address === "string" &&
            typeof (w as LinkedWallet).family === "string",
        );
      }
    }
  } catch {
    // Corrupt storage — start fresh rather than crash the profile page.
  }
  useIdentityStates.setState({ linked, hydrated: true });
};
