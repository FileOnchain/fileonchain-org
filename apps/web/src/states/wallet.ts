import { ApiPromise, NetworkId } from "@autonomys/auto-utils";
import { create } from "zustand";
import type { Account, ChainFamily } from "@/types/types";

interface WalletState {
  /** Currently connected chain family, or null when no wallet is connected. */
  chainFamily: ChainFamily | null;
  networkId: NetworkId;
  accounts: Account[];
  selectedAccount: Account | null;
  api: ApiPromise | null;
  /** EVM address once connected via injected wallet. */
  evmAddress: `0x${string}` | null;
  /** Solana address once connected. */
  solanaAddress: string | null;
  /** Aptos address once connected. */
  aptosAddress: string | null;
}

interface WalletStateAndHelpers extends WalletState {
  setNetworkId: (networkId: NetworkId) => void;
  setAccounts: (accounts: Account[]) => void;
  setSelectedAccount: (selectedAccount: Account | null) => void;
  setApi: (api: ApiPromise) => void;
  setChainFamily: (family: ChainFamily | null) => void;
  setEvmAddress: (address: `0x${string}` | null) => void;
  setSolanaAddress: (address: string | null) => void;
  setAptosAddress: (address: string | null) => void;
  clear: () => void;
}

const initialState: WalletState = {
  chainFamily: null,
  networkId: NetworkId.MAINNET,
  accounts: [],
  selectedAccount: null,
  api: null,
  evmAddress: null,
  solanaAddress: null,
  aptosAddress: null,
};

export const useWalletStates = create<WalletStateAndHelpers>((set) => ({
  ...initialState,
  setNetworkId: (networkId) => set(() => ({ networkId })),
  setAccounts: (accounts) => set(() => ({ accounts })),
  setSelectedAccount: (selectedAccount) => set(() => ({ selectedAccount })),
  setApi: (api) => set(() => ({ api })),
  setChainFamily: (chainFamily) => set(() => ({ chainFamily })),
  setEvmAddress: (evmAddress) => set(() => ({ evmAddress })),
  setSolanaAddress: (solanaAddress) => set(() => ({ solanaAddress })),
  setAptosAddress: (aptosAddress) => set(() => ({ aptosAddress })),
  clear: () => set(() => ({ ...initialState })),
}));