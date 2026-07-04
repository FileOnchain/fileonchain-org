"use client";

import { useCallback } from "react";
import { useWalletStates } from "@/states/wallet";

/* TODO: wire to @near-wallet-selector for the full modal / wallet list flow */

interface NearSignMessageResponse {
  accountId: string;
  /** "ed25519:..." encoded public key that produced the signature. */
  publicKey: string;
  /** Base64-encoded NEP-413 signature. */
  signature: string;
}

interface NearProvider {
  isSignedIn?: () => boolean;
  requestSignIn: (params: { contractId?: string }) => Promise<unknown>;
  getAccountId?: () => string | Promise<string>;
  accountId?: string;
  signOut?: () => Promise<void> | void;
  /** NEP-413 message signing — used for wallet-auth proofs. */
  signMessage?: (params: {
    message: string;
    nonce: number[] | Uint8Array;
    recipient: string;
    callbackUrl?: string;
  }) => Promise<NearSignMessageResponse>;
  /** Sender / Meteor transaction flow — used by the anchor sender. */
  signAndSendTransaction: (params: {
    receiverId: string;
    actions: Array<{ methodName?: string; type?: string; params?: unknown }>;
  }) => Promise<unknown>;
}

declare global {
  interface Window {
    near?: NearProvider;
  }
}

/**
 * Injected `window.near` provider (Sender / Meteor style extensions). The
 * redirect-based MyNearWallet flow is out of scope — it round-trips through a
 * hosted page and needs a callback route, not a provider call.
 */
export const getNearProvider = (): NearProvider | null => {
  if (typeof window === "undefined") return null;
  return window.near ?? null;
};

/**
 * useNearWallet — connects to Sender / Meteor via the global `window.near`
 * provider. No mount-time reads: the wallet is only consulted on explicit
 * connect() so the browser doesn't surprise the user with a pop-up on load.
 */
export const useNearWallet = () => {
  const nearAddress = useWalletStates((s) => s.nearAddress);
  const setNearAddress = useWalletStates((s) => s.setNearAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const connect = useCallback(async () => {
    const provider = getNearProvider();
    if (!provider) {
      throw new Error("No NEAR wallet detected. Install Sender or Meteor.");
    }
    await provider.requestSignIn({});
    const accountId =
      (await provider.getAccountId?.()) ?? provider.accountId ?? null;
    if (!accountId) {
      throw new Error("Could not read the NEAR account id");
    }
    setNearAddress(accountId);
    setChainFamily("near");
    return accountId;
  }, [setNearAddress, setChainFamily]);

  const disconnect = useCallback(async () => {
    const provider = getNearProvider();
    if (provider?.signOut) {
      try {
        await provider.signOut();
      } catch {
        // ignore
      }
    }
    setNearAddress(null);
    setChainFamily(null);
  }, [setNearAddress, setChainFamily]);

  /**
   * NEP-413 message signing. The wallet signs its own envelope over
   * (message, nonce, recipient); the response is passed through as given —
   * `signature` base64, `publicKey` "ed25519:..." — so the server verifies
   * against the same NEP-413 structure.
   */
  const signMessage = useCallback(
    async (
      message: string,
      nonce: Uint8Array,
      recipient: string,
    ): Promise<NearSignMessageResponse> => {
      const provider = getNearProvider();
      if (!provider?.signMessage) {
        throw new Error(
          "The connected NEAR wallet cannot sign messages (NEP-413)",
        );
      }
      return provider.signMessage({ message, nonce, recipient });
    },
    [],
  );

  return {
    address: nearAddress,
    connect,
    disconnect,
    signMessage,
  };
};
