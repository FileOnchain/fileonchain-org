"use client";

import { useCallback, useEffect } from "react";
import { useWalletStates } from "@/states/wallet";
import { getAptosNetworks } from "@/lib/chains/aptos";

/* TODO: wire to Petra / Martian wallet standard via aptos-wallet-adapter */

interface AptosProvider {
  isPetra?: boolean;
  isMartian?: boolean;
  connect: () => Promise<{ address: string }>;
  disconnect: () => Promise<void>;
  account?: () => Promise<{ address: string } | null>;
  onAccountChange?: (handler: (addr: string | null) => void) => void;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    aptos?: AptosProvider;
    martian?: AptosProvider;
    petra?: AptosProvider;
  }
}

/**
 * useAptosWallet — connects to Petra / Martian via the global `window.aptos`
 * provider. Aptos SDK loaded lazily to avoid SSR `window`/`crypto` issues.
 */
export const useAptosWallet = () => {
  const aptosAddress = useWalletStates((s) => s.aptosAddress);
  const setAptosAddress = useWalletStates((s) => s.setAptosAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const getProvider = (): AptosProvider | null => {
    if (typeof window === "undefined") return null;
    return window.petra ?? window.aptos ?? window.martian ?? null;
  };

  useEffect(() => {
    const provider = getProvider();
    if (!provider?.account) return;
    void provider
      .account()
      .then((acct) => {
        if (acct?.address && !aptosAddress) {
          setAptosAddress(acct.address);
          setChainFamily("aptos");
        }
      })
      .catch(() => {
        // not connected
      });
  }, [aptosAddress, setAptosAddress, setChainFamily]);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      throw new Error("No Aptos wallet detected. Install Petra or Martian.");
    }
    const { address } = await provider.connect();
    setAptosAddress(address);
    setChainFamily("aptos");
    return address;
  }, [setAptosAddress, setChainFamily]);

  const disconnect = useCallback(async () => {
    const provider = getProvider();
    if (provider?.disconnect) {
      try {
        await provider.disconnect();
      } catch {
        // ignore
      }
    }
    setAptosAddress(null);
    setChainFamily(null);
  }, [setAptosAddress, setChainFamily]);

  const getClient = useCallback(async (network: "mainnet" | "testnet" = "mainnet") => {
    const { Aptos, AptosConfig, Network } = await import("@aptos-labs/ts-sdk");
    const cfg = new AptosConfig({ network: network === "mainnet" ? Network.MAINNET : Network.TESTNET });
    return new Aptos(cfg);
  }, []);

  const getNetworkRpcUrl = useCallback((network: "mainnet" | "testnet" = "mainnet") => {
    return getAptosNetworks().find((n) => n.testnet === (network === "testnet"))?.rpcUrl ?? "";
  }, []);

  return { address: aptosAddress, connect, disconnect, getClient, getNetworkRpcUrl };
};