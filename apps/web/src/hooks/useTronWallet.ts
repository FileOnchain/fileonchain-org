"use client";

import { useCallback } from "react";
import { useWalletStates } from "@/states/wallet";
import { trackEvent } from "@/lib/analytics";

/* TODO: wire to @tronweb3/tronwallet-adapters for multi-wallet support */

/** Narrow view of the TronWeb instance TronLink injects — no npm dependency. */
interface TronWebLike {
  defaultAddress?: { base58?: string | false };
  ready?: boolean;
  fullNode?: { host: string };
  transactionBuilder: {
    sendTrx(
      to: string,
      amount: number,
      from: string,
    ): Promise<Record<string, unknown>>;
    addUpdateData(
      tx: Record<string, unknown>,
      data: string,
      dataFormat?: string,
    ): Promise<Record<string, unknown>>;
  };
  trx: {
    sign(tx: Record<string, unknown>): Promise<Record<string, unknown>>;
    sendRawTransaction(signed: Record<string, unknown>): Promise<{
      result?: boolean;
      txid?: string;
      transaction?: { txID?: string };
    }>;
    signMessageV2?(message: string): Promise<string>;
  };
}

interface TronLinkProvider {
  request(args: {
    method: "tron_requestAccounts";
  }): Promise<{ code: number } | unknown>;
  tronWeb?: TronWebLike;
}

declare global {
  interface Window {
    tronLink?: TronLinkProvider;
    tronWeb?: TronWebLike;
  }
}

/**
 * useTronWallet — connects to TronLink via the global `window.tronLink` /
 * `window.tronWeb` provider. TronLink injects a full TronWeb instance, so
 * there is nothing to dynamic-import; the types above stay deliberately
 * narrow.
 */
export const useTronWallet = () => {
  const tronAddress = useWalletStates((s) => s.tronAddress);
  const setTronAddress = useWalletStates((s) => s.setTronAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const getProvider = (): TronWebLike | null => {
    if (typeof window === "undefined") return null;
    return window.tronLink?.tronWeb ?? window.tronWeb ?? null;
  };

  const connect = useCallback(async () => {
    // TronLink gates account access behind tron_requestAccounts; older
    // injections only expose window.tronWeb, so the request is best-effort.
    if (typeof window !== "undefined" && window.tronLink) {
      await window.tronLink.request({ method: "tron_requestAccounts" });
    }
    const provider = getProvider();
    if (!provider) {
      throw new Error("No TRON wallet detected. Install TronLink.");
    }
    const address = provider.defaultAddress?.base58;
    if (!address) {
      throw new Error("Unlock TronLink and try again.");
    }
    setTronAddress(address);
    setChainFamily("tron");
    trackEvent("wallet_connect", { family: "tron" });
    return address;
  }, [setTronAddress, setChainFamily]);

  const disconnect = useCallback(async () => {
    // TronLink has no programmatic disconnect — just clear our state.
    setTronAddress(null);
    setChainFamily(null);
  }, [setTronAddress, setChainFamily]);

  /** TIP-191-style message signing (signMessageV2); returns a hex signature. */
  const signMessage = useCallback(async (message: string): Promise<string> => {
    const provider = getProvider();
    if (!provider?.trx.signMessageV2) {
      throw new Error("The connected TRON wallet cannot sign messages");
    }
    return provider.trx.signMessageV2(message);
  }, []);

  return {
    address: tronAddress,
    connect,
    disconnect,
    signMessage,
  };
};
