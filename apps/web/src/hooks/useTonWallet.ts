"use client";

import { useCallback } from "react";
import { useWalletStates } from "@/states/wallet";

/* TODO: wire to full TON Connect (bridge + manifest) for mobile / remote wallets */

interface TonProvider {
  isOpenMask?: boolean;
  /** OpenMask / MyTonWallet JSON-RPC style entry point. */
  send(method: "ton_requestAccounts"): Promise<string[]>;
  /** Comment-carrying transfer flow — used by the anchor sender. */
  send(
    method: "ton_sendTransaction",
    params: [{ to: string; value: string; dataType?: "text"; data?: string }],
  ): Promise<unknown>;
}

declare global {
  interface Window {
    ton?: TonProvider;
  }
}

/**
 * useTonWallet — connects to OpenMask / MyTonWallet via the injected
 * `window.ton` provider. Full TON Connect (bridge + manifest) is a follow-up;
 * the injected-provider path covers extension wallets today.
 *
 * No signMessage: sign-in/auth for TON is intentionally out of scope — see
 * WALLET_FAMILIES in `@/lib/auth/wallet-message.ts`.
 */
export const useTonWallet = () => {
  const tonAddress = useWalletStates((s) => s.tonAddress);
  const setTonAddress = useWalletStates((s) => s.setTonAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const getProvider = (): TonProvider | null => {
    if (typeof window === "undefined") return null;
    return window.ton ?? null;
  };

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      throw new Error("No TON wallet detected. Install OpenMask or MyTonWallet.");
    }
    const [address] = await provider.send("ton_requestAccounts");
    setTonAddress(address);
    setChainFamily("ton");
    return address;
  }, [setTonAddress, setChainFamily]);

  const disconnect = useCallback(async () => {
    // Injected TON providers expose no disconnect — just clear local state.
    setTonAddress(null);
    setChainFamily(null);
  }, [setTonAddress, setChainFamily]);

  return {
    address: tonAddress,
    connect,
    disconnect,
  };
};
