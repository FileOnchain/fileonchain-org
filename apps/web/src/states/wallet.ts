import { ApiPromise, NetworkId } from "@autonomys/auto-utils";
import { create } from "zustand";
import type { ChainFamily } from "@fileonchain/sdk";
import { isWalletFamily } from "@/lib/auth/wallet-message";
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

const WALLET_STORAGE_KEY = "fileonchain-wallet";

/** The serializable identity slice persisted across reloads — which wallet
 * is connected, not the live handles (api stays in-memory; providers are
 * re-requested on demand by the family hooks and signers). */
const identitySlice = (state: WalletState) => ({
  chainFamily: state.chainFamily,
  networkId: state.networkId,
  selectedAccount: state.selectedAccount,
  evmAddress: state.evmAddress,
  solanaAddress: state.solanaAddress,
  aptosAddress: state.aptosAddress,
  cosmosAddress: state.cosmosAddress,
  suiAddress: state.suiAddress,
  starknetAddress: state.starknetAddress,
  nearAddress: state.nearAddress,
  tronAddress: state.tronAddress,
  cardanoAddress: state.cardanoAddress,
  tonAddress: state.tonAddress,
  hederaAddress: state.hederaAddress,
});

let identityHydrated = false;

/**
 * Restore the persisted wallet identity after mount (idempotent; SSR markup
 * stays deterministic — same pattern as states/preferences.ts). Until this
 * runs, connections are not persisted either, so a pre-hydration set can
 * never clobber the stored identity.
 */
export const hydrateWalletIdentity = () => {
  if (typeof window === "undefined" || identityHydrated) return;
  identityHydrated = true;
  try {
    const raw = window.localStorage.getItem(WALLET_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const patch: Partial<WalletState> = {};
    if (isWalletFamily(parsed.chainFamily)) patch.chainFamily = parsed.chainFamily;
    if (typeof parsed.networkId === "string")
      patch.networkId = parsed.networkId as NetworkId;
    const account = parsed.selectedAccount as Account | null | undefined;
    if (account && typeof account === "object" && typeof account.address === "string")
      patch.selectedAccount = account;
    if (typeof parsed.evmAddress === "string")
      patch.evmAddress = parsed.evmAddress as `0x${string}`;
    if (typeof parsed.solanaAddress === "string") patch.solanaAddress = parsed.solanaAddress;
    if (typeof parsed.aptosAddress === "string") patch.aptosAddress = parsed.aptosAddress;
    if (typeof parsed.cosmosAddress === "string") patch.cosmosAddress = parsed.cosmosAddress;
    if (typeof parsed.suiAddress === "string") patch.suiAddress = parsed.suiAddress;
    if (typeof parsed.starknetAddress === "string") patch.starknetAddress = parsed.starknetAddress;
    if (typeof parsed.nearAddress === "string") patch.nearAddress = parsed.nearAddress;
    if (typeof parsed.tronAddress === "string") patch.tronAddress = parsed.tronAddress;
    if (typeof parsed.cardanoAddress === "string") patch.cardanoAddress = parsed.cardanoAddress;
    if (typeof parsed.tonAddress === "string") patch.tonAddress = parsed.tonAddress;
    if (typeof parsed.hederaAddress === "string") patch.hederaAddress = parsed.hederaAddress;
    useWalletStates.setState(patch);
  } catch {
    // Corrupt or blocked storage — start disconnected.
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

// Persist the identity slice on every change (clear() persists the reset,
// so disconnecting really forgets the wallet). Gated on hydration so the
// initial empty state never overwrites a stored identity.
useWalletStates.subscribe((state) => {
  if (typeof window === "undefined" || !identityHydrated) return;
  try {
    window.localStorage.setItem(
      WALLET_STORAGE_KEY,
      JSON.stringify(identitySlice(state)),
    );
  } catch {
    // Storage unavailable (private mode, quota) — stay in-memory only.
  }
});