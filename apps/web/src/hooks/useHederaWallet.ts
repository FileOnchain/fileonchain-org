"use client";

import { useCallback } from "react";
import { useWalletStates } from "@/states/wallet";

/* TODO: wire to HashConnect v3 — pairing flow + hedera_signAndExecuteTransaction */

/**
 * useHederaWallet — honest seam, not a connector. Hedera has no injected
 * provider standard (`window.hedera` doesn't exist): HashPack pairs via
 * HashConnect, which needs a WalletConnect project id and a session-storage
 * pairing flow that is deliberately a follow-up. Until then `connect` always
 * throws with the path that works today (credits / the API — the anchor
 * worker submits HCS messages with the operator signer), and no `signMessage`
 * is exposed because Hedera auth is out of scope (see WALLET_FAMILIES in
 * `lib/auth/wallet-message.ts`).
 */
export const useHederaWallet = () => {
  const hederaAddress = useWalletStates((s) => s.hederaAddress);
  const setHederaAddress = useWalletStates((s) => s.setHederaAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const connect = useCallback(async (): Promise<string> => {
    throw new Error(
      "Hedera wallets pair via HashConnect, which FileOnChain doesn't ship yet — anchor on Hedera with credits or the API instead.",
    );
  }, []);

  const disconnect = useCallback(async () => {
    // Nothing can be paired yet, but clearing state anyway keeps the hook
    // shape uniform with the other families.
    setHederaAddress(null);
    setChainFamily(null);
  }, [setHederaAddress, setChainFamily]);

  return {
    address: hederaAddress,
    connect,
    disconnect,
  };
};
