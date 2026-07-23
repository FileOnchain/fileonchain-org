"use client";

import { useCallback, useMemo } from "react";
import {
  useTonAddress,
  useTonConnectUI,
  type SignDataPayload,
} from "@tonconnect/ui-react";
import { useWalletStates } from "@/states/wallet";
import { trackEvent } from "@/lib/analytics";

/**
 * Injected `window.ton` JSON-RPC provider (OpenMask / MyTonWallet extensions).
 * Acts as a fallback when no TON Connect UI is available — sign-in still
 * needs TON Connect, but the anchor sender (apps/web/src/lib/anchor/ton.ts)
 * rides the injected `ton_sendTransaction` path.
 */
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

export interface TonSignResult {
  /** Base64-encoded Ed25519 signature. */
  signature: string;
  /** Raw `<workchain>:<hex>` wallet address. */
  address: string;
  /** Unix epoch seconds at signing time — embedded in the digest. */
  timestamp: number;
  /** App domain bound into the signature. */
  domain: string;
  /** Echoed payload object. */
  payload: SignDataPayload;
  /** Ed25519 public key (hex, no `0x`) — required for verifier. */
  publicKey: string;
}

/**
 * useTonWallet — TON Connect primary path (`signData` over the wallet-standard
 * envelope), `window.ton` only as the anchor fallback. Sign-in for TON goes
 * through TON Connect because only the connect handshake binds the user's
 * ed25519 publicKey into the proof payload.
 *
 * The signing envelope is reconstructed server-side in
 * `apps/web/src/lib/auth/verifiers/ton.ts` — the proof carries `signature`,
 * `publicKey`, `timestamp`, `domain`, and the verbatim message payload.
 */
export const useTonWallet = () => {
  const [tcui] = useTonConnectUI();
  const userFriendlyAddress = useTonAddress();
  const tonAddress = useWalletStates((s) => s.tonAddress);
  const setTonAddress = useWalletStates((s) => s.setTonAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  // Raw `<workchain>:<hex>` form is what the verifier signs against.
  // `useTonAddress(false)` returns the raw form; the user-friendly form is
  // for display only.
  const rawAddress = useTonAddress(false);

  const getInjectedProvider = (): TonProvider | null => {
    if (typeof window === "undefined") return null;
    return window.ton ?? null;
  };

  const connect = useCallback(async (): Promise<string> => {
    if (rawAddress) return rawAddress;
    // Open the TON Connect modal — the user picks a wallet (mobile QR,
    // browser extension, or in-wallet browser). The `restoreConnection`
    // option on TonConnectUIProvider auto-restores prior sessions on mount,
    // so a refresh of a connected session flows straight to the address path.
    try {
      tcui.openModal();
    } catch {
      const injected = getInjectedProvider();
      if (!injected) {
        throw new Error(
          "No TON Connect wallet detected — install Tonkeeper, MyTonWallet, or OpenMask.",
        );
      }
      const [address] = await injected.send("ton_requestAccounts");
      setTonAddress(address);
      setChainFamily("ton");
      trackEvent("wallet_connect", { family: "ton" });
      return address;
    }
    // `tcui.openModal()` is synchronous; the actual handshake resolves via
    // the TonConnectUIProvider's `onStatusChange` listener. Poll for the
    // connected account with a short timeout — most wallets approve in
    // under a few seconds, but users can also cancel.
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (tcui.connector.account?.address) {
        const addr = tcui.connector.account.address;
        setTonAddress(addr);
        setChainFamily("ton");
        trackEvent("wallet_connect", { family: "ton" });
        return addr;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("TON Connect handshake timed out");
  }, [tcui, rawAddress, setTonAddress, setChainFamily]);

  const disconnect = useCallback(async () => {
    try {
      await tcui.connector.disconnect();
    } catch {
      // Wallet may already be disconnected — clear local state anyway.
    }
    setTonAddress(null);
    setChainFamily(null);
  }, [tcui, setTonAddress, setChainFamily]);

  const signMessage = useCallback(
    async (message: string): Promise<TonSignResult> => {
      const account = tcui.connector.account;
      if (!account) {
        throw new Error("Connect a TON wallet before signing");
      }
      const publicKey = account.publicKey;
      if (!publicKey) {
        throw new Error(
          "Connected TON wallet did not advertise an ed25519 publicKey — sign-in requires it",
        );
      }
      const { signature, address, timestamp, domain, payload } =
        await tcui.connector.signData({
          type: "text",
          text: message,
        });
      return { signature, address, timestamp, domain, payload, publicKey };
    },
    [tcui],
  );

  const address = useMemo(
    () => tonAddress ?? rawAddress ?? userFriendlyAddress ?? null,
    [tonAddress, rawAddress, userFriendlyAddress],
  );

  return {
    address,
    connect,
    disconnect,
    signMessage,
  };
};