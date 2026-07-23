"use client";

import { useCallback } from "react";
import { useWalletStates } from "@/states/wallet";
import { trackEvent } from "@/lib/analytics";

// `useStarknetWallet` talks to Argent / Braavos through their injected
// `window.starket` (ArgentX) / `window.starknet_braavos` providers
// directly. `get-starknet` / `@starknetkit-io/starknetkit` would add a
// multi-wallet modal — out of scope per the project's "targeted, not all
// 12" wallet-adapter directive.

interface StarknetAccount {
  address: string;
  /** Argent / Braavos multicall flow — used by the anchor sender. */
  execute: (calls: unknown) => Promise<{ transaction_hash: string }>;
  /** SNIP-12 typed-data signing; returns the signature felt array. */
  signMessage: (typedData: unknown) => Promise<string[]>;
}

interface StarknetProvider {
  enable: () => Promise<string[] | void>;
  isConnected?: boolean;
  selectedAddress?: string;
  account?: StarknetAccount;
}

declare global {
  interface Window {
    starknet_argentX?: StarknetProvider;
    starknet_braavos?: StarknetProvider;
    starknet?: StarknetProvider;
  }
}

const getProvider = (): StarknetProvider | null => {
  if (typeof window === "undefined") return null;
  return window.starknet_argentX ?? window.starknet_braavos ?? window.starknet ?? null;
};

/**
 * The connected account object, for callers outside React (the anchor
 * sender). Null until the user has connected via `useStarknetWallet`.
 */
export const getStarknetAccount = (): StarknetAccount | null =>
  getProvider()?.account ?? null;

/**
 * useStarknetWallet — connects to Argent X / Braavos via their injected
 * `window.starknet_*` providers.
 *
 * No mount-time reads: the wallet is only consulted on explicit connect() so
 * the browser doesn't surprise the user with a pop-up on page load.
 */
export const useStarknetWallet = () => {
  const starknetAddress = useWalletStates((s) => s.starknetAddress);
  const setStarknetAddress = useWalletStates((s) => s.setStarknetAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      throw new Error("No Starknet wallet detected. Install Argent or Braavos.");
    }
    await provider.enable();
    const address = provider.selectedAddress ?? provider.account?.address;
    if (!address) {
      throw new Error("The Starknet wallet did not expose an account address");
    }
    setStarknetAddress(address);
    setChainFamily("starknet");
    trackEvent("wallet_connect", { family: "starknet" });
    return address;
  }, [setStarknetAddress, setChainFamily]);

  const disconnect = useCallback(async () => {
    // Injected Starknet wallets have no programmatic disconnect — just clear
    // our state; the user revokes the site from the wallet UI.
    setStarknetAddress(null);
    setChainFamily(null);
  }, [setStarknetAddress, setChainFamily]);

  /**
   * SNIP-12 typed-data signing; the caller builds the typed data. Returns
   * the signature as a felt array.
   */
  const signTypedData = useCallback(async (typedData: unknown): Promise<string[]> => {
    const account = getStarknetAccount();
    if (!account) {
      throw new Error("The connected Starknet wallet cannot sign messages");
    }
    return account.signMessage(typedData);
  }, []);

  return {
    address: starknetAddress,
    connect,
    disconnect,
    signTypedData,
  };
};
