"use client";

import { useCallback } from "react";
import { useWalletStates } from "@/states/wallet";
import { getChain } from "@fileonchain/sdk";
import { trackEvent } from "@/lib/analytics";

/* TODO: wire to Petra / Martian wallet standard via aptos-wallet-adapter */

interface AptosSignMessageResponse {
  fullMessage: string;
  signature: string | Uint8Array;
  nonce?: string;
}

interface AptosProvider {
  isPetra?: boolean;
  isMartian?: boolean;
  connect: () => Promise<{ address: string; publicKey?: string }>;
  disconnect: () => Promise<void>;
  account?: () => Promise<{ address: string; publicKey?: string } | null>;
  signMessage?: (args: {
    message: string;
    nonce: string;
  }) => Promise<AptosSignMessageResponse>;
  /** Petra / Martian entry-function flow — used by the anchor sender. */
  signAndSubmitTransaction?: (payload: {
    type: string;
    function: string;
    type_arguments: string[];
    arguments: unknown[];
  }) => Promise<{ hash: string }>;
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
 *
 * No mount-time reads: the wallet is only consulted on explicit connect() so
 * the browser doesn't surprise the user with a pop-up on page load.
 */
export const useAptosWallet = () => {
  const aptosAddress = useWalletStates((s) => s.aptosAddress);
  const setAptosAddress = useWalletStates((s) => s.setAptosAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const getProvider = (): AptosProvider | null => {
    if (typeof window === "undefined") return null;
    return window.petra ?? window.aptos ?? window.martian ?? null;
  };

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      throw new Error("No Aptos wallet detected. Install Petra or Martian.");
    }
    const { address } = await provider.connect();
    setAptosAddress(address);
    setChainFamily("aptos");
    trackEvent("wallet_connect", { family: "aptos" });
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
    return getChain(network === "testnet" ? "aptos:testnet" : "aptos:mainnet")?.rpcUrl ?? "";
  }, []);

  /**
   * Wallet-standard message signing. Aptos wallets sign their own envelope
   * (APTOS\naddress: …\nmessage: …\nnonce: …) — the returned `fullMessage`
   * is what the signature covers, so the server verifies against it.
   */
  const signMessage = useCallback(
    async (message: string, nonce: string) => {
      const provider = getProvider();
      if (!provider?.signMessage) {
        throw new Error("The connected Aptos wallet cannot sign messages");
      }
      const response = await provider.signMessage({ message, nonce });
      const account = await provider.account?.();
      if (!account?.publicKey) {
        throw new Error("Could not read the Aptos account public key");
      }
      // Avoid Buffer — it isn't polyfilled in the client bundle.
      const signature =
        typeof response.signature === "string"
          ? response.signature
          : Array.from(response.signature)
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join("");
      return {
        signature,
        fullMessage: response.fullMessage,
        publicKey: account.publicKey,
      };
    },
    [],
  );

  return {
    address: aptosAddress,
    connect,
    disconnect,
    getClient,
    getNetworkRpcUrl,
    signMessage,
  };
};