"use client";

import { useCallback } from "react";
import { useWalletStates } from "@/states/wallet";

/* TODO: wire to cosmos-kit for the full Keplr / Leap wallet-standard flow */

interface CosmosProvider {
  enable: (chainId: string) => Promise<void>;
  getKey: (
    chainId: string,
  ) => Promise<{ bech32Address: string; pubKey: Uint8Array }>;
  /** Amino/Direct signer handle — used by the anchor sender via cosmjs. */
  getOfflineSigner: (chainId: string) => unknown;
  signArbitrary: (
    chainId: string,
    signer: string,
    data: string,
  ) => Promise<{
    signature: string;
    pub_key: { type: string; value: string };
  }>;
}

declare global {
  interface Window {
    keplr?: CosmosProvider;
    leap?: CosmosProvider;
  }
}

/** Our ChainIds are "cosmos:<chain-id>" — strip the family prefix. */
export const toCosmosChainId = (chainId: string): string =>
  chainId.startsWith("cosmos:") ? chainId.slice("cosmos:".length) : chainId;

const DEFAULT_COSMOS_CHAIN_ID = "cosmoshub-4";

/**
 * useCosmosWallet — connects to Keplr / Leap via the global `window.keplr`
 * provider. All wallet reads happen on explicit connect() so the browser
 * doesn't surprise the user with a pop-up on page load, and no `window`
 * access happens at module scope (SSR-safe).
 */
export const useCosmosWallet = () => {
  const cosmosAddress = useWalletStates((s) => s.cosmosAddress);
  const setCosmosAddress = useWalletStates((s) => s.setCosmosAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const getProvider = (): CosmosProvider | null => {
    if (typeof window === "undefined") return null;
    return window.keplr ?? window.leap ?? null;
  };

  const connect = useCallback(
    async (cosmosChainId: string = DEFAULT_COSMOS_CHAIN_ID) => {
      const provider = getProvider();
      if (!provider) {
        throw new Error("No Cosmos wallet detected. Install Keplr or Leap.");
      }
      await provider.enable(cosmosChainId);
      const { bech32Address } = await provider.getKey(cosmosChainId);
      setCosmosAddress(bech32Address);
      setChainFamily("cosmos");
      return bech32Address;
    },
    [setCosmosAddress, setChainFamily],
  );

  const disconnect = useCallback(async () => {
    // Keplr / Leap expose no programmatic disconnect — just clear our state.
    setCosmosAddress(null);
    setChainFamily(null);
  }, [setCosmosAddress, setChainFamily]);

  /**
   * ADR-36 arbitrary-message signing; returns the base64 signature and the
   * base64 secp256k1 public key. Verification happens server-side.
   */
  const signMessage = useCallback(
    async (
      message: string,
      cosmosChainId: string = DEFAULT_COSMOS_CHAIN_ID,
    ) => {
      const provider = getProvider();
      if (!provider) {
        throw new Error("No Cosmos wallet detected. Install Keplr or Leap.");
      }
      const { cosmosAddress: address } = useWalletStates.getState();
      const signer =
        address ?? (await provider.getKey(cosmosChainId)).bech32Address;
      const response = await provider.signArbitrary(
        cosmosChainId,
        signer,
        message,
      );
      return {
        signature: response.signature,
        publicKey: response.pub_key.value,
      };
    },
    [],
  );

  return {
    address: cosmosAddress,
    connect,
    disconnect,
    signMessage,
  };
};
