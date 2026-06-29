import { ApiPromise, NetworkId } from "@autonomys/auto-utils";
import { create } from "zustand";
import { Account } from "@/types/types";

interface WalletState {
  networkId: NetworkId;
  accounts: Account[];
  selectedAccount: Account | null;
  api: ApiPromise | null;
}

interface WalletStateAndHelpers extends WalletState {
  setNetworkId: (networkId: NetworkId) => void;
  setAccounts: (accounts: Account[]) => void;
  setSelectedAccount: (selectedAccount: Account | null) => void;
  setApi: (api: ApiPromise) => void;
  clear: () => void;
}

const initialState: WalletState = {
  networkId: NetworkId.MAINNET,
  accounts: [],
  selectedAccount: null,
  api: null,
};

export const useWalletStates = create<WalletStateAndHelpers>((set) => ({
  ...initialState,
  setNetworkId: (networkId) => set(() => ({ networkId })),
  setAccounts: (accounts) => set(() => ({ accounts })),
  setSelectedAccount: (selectedAccount) => set(() => ({ selectedAccount })),
  setApi: (api) => set(() => ({ api })),
  clear: () => set(() => ({ ...initialState })),
}));
