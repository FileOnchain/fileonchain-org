import { ApiPromise, NetworkId } from "@autonomys/auto-utils";
import { create } from "zustand";
import type { ChainFamily } from "@fileonchain/sdk";
import type { Account } from "@/types/types";

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
  /** Cosmos address once connected. */
  cosmosAddress: string | null;
  /** Sui address once connected. */
  suiAddress: string | null;
  /** Starknet address once connected. */
  starknetAddress: string | null;
  /** Near address once connected. */
  nearAddress: string | null;
  /** Tron address once connected. */
  tronAddress: string | null;
  /** Cardano address once connected. */
  cardanoAddress: string | null;
  /** Ton address once connected. */
  tonAddress: string | null;
  /** Hedera address once connected. */
  hederaAddress: string | null;
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
  setCosmosAddress: (address: string | null) => void;
  setSuiAddress: (address: string | null) => void;
  setStarknetAddress: (address: string | null) => void;
  setNearAddress: (address: string | null) => void;
  setTronAddress: (address: string | null) => void;
  setCardanoAddress: (address: string | null) => void;
  setTonAddress: (address: string | null) => void;
  setHederaAddress: (address: string | null) => void;
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
  cosmosAddress: null,
  suiAddress: null,
  starknetAddress: null,
  nearAddress: null,
  tronAddress: null,
  cardanoAddress: null,
  tonAddress: null,
  hederaAddress: null,
};

/** Connected address for a chain family, or null when that family's wallet
 * isn't connected. Substrate reads the selected extension account; every
 * other family reads its per-family address slot. */
export const getFamilyAddress = (
  state: WalletState,
  family: ChainFamily | null,
): string | null => {
  switch (family) {
    case "substrate":
      return state.selectedAccount?.address ?? null;
    case "evm":
      return state.evmAddress;
    case "solana":
      return state.solanaAddress;
    case "aptos":
      return state.aptosAddress;
    case "cosmos":
      return state.cosmosAddress;
    case "sui":
      return state.suiAddress;
    case "starknet":
      return state.starknetAddress;
    case "near":
      return state.nearAddress;
    case "tron":
      return state.tronAddress;
    case "cardano":
      return state.cardanoAddress;
    case "ton":
      return state.tonAddress;
    case "hedera":
      return state.hederaAddress;
    default:
      return null;
  }
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
  setCosmosAddress: (cosmosAddress) => set(() => ({ cosmosAddress })),
  setSuiAddress: (suiAddress) => set(() => ({ suiAddress })),
  setStarknetAddress: (starknetAddress) => set(() => ({ starknetAddress })),
  setNearAddress: (nearAddress) => set(() => ({ nearAddress })),
  setTronAddress: (tronAddress) => set(() => ({ tronAddress })),
  setCardanoAddress: (cardanoAddress) => set(() => ({ cardanoAddress })),
  setTonAddress: (tonAddress) => set(() => ({ tonAddress })),
  setHederaAddress: (hederaAddress) => set(() => ({ hederaAddress })),
  clear: () => set(() => ({ ...initialState })),
}));