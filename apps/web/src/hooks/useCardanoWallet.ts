"use client";

import { useCallback } from "react";
import { useWalletStates } from "@/states/wallet";

/* TODO: wire to a wallet-standard adapter once one settles for Cardano */

/** The API a CIP-30 wallet hands back from `enable()`. */
interface Cip30Api {
  getUsedAddresses: () => Promise<string[]>;
  getChangeAddress: () => Promise<string>;
  getNetworkId: () => Promise<number>;
  /** CIP-8 data signing over hex payloads — used by the login proof flow. */
  signData: (
    addr: string,
    payloadHex: string,
  ) => Promise<{ signature: string; key: string }>;
}

/** What each wallet injects under `window.cardano.<key>` (CIP-30). */
interface CardanoWalletProvider {
  enable: () => Promise<Cip30Api>;
  isEnabled: () => Promise<boolean>;
  name: string;
  icon: string;
}

/**
 * `@meshsdk/core` already declares a global `window.cardano` with its own
 * wallet shape, so redeclaring it collides — read the injection through our
 * narrower CIP-30 view instead.
 */
const getInjectedWallets = (): Record<
  string,
  CardanoWalletProvider | undefined
> | null => {
  if (typeof window === "undefined") return null;
  return (
    (
      window as unknown as {
        cardano?: Record<string, CardanoWalletProvider | undefined>;
      }
    ).cardano ?? null
  );
};

/** Best-known wallets first; anything else CIP-30-shaped comes after. */
const WALLET_PREFERENCE = [
  "lace",
  "eternl",
  "nami",
  "flint",
  "typhoncip30",
  "yoroi",
];

const pickWalletKey = (): string | null => {
  const injected = getInjectedWallets();
  if (!injected) return null;
  for (const key of WALLET_PREFERENCE) {
    if (typeof injected[key]?.enable === "function") return key;
  }
  const fallback = Object.keys(injected).find(
    (key) => typeof injected[key]?.enable === "function",
  );
  return fallback ?? null;
};

/** The wallet the user enabled, kept module-level so the anchor sender can reuse it. */
let enabledWallet: { key: string; api: Cip30Api } | null = null;

/** CIP-30 api + injection key of the enabled wallet, or null before connect(). */
export const getEnabledCardanoWallet = (): {
  key: string;
  api: Cip30Api;
} | null => enabledWallet;

/** Just the `window.cardano` key of the enabled wallet (what Mesh's `BrowserWallet.enable` takes). */
export const getCardanoWalletKey = (): string | null =>
  enabledWallet?.key ?? null;

const toHex = (text: string): string =>
  Array.from(new TextEncoder().encode(text))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/**
 * useCardanoWallet — connects to Lace / Eternl / Nami via the CIP-30
 * `window.cardano.<key>` injection. Mesh (`@meshsdk/core`) is loaded lazily so
 * SSR never touches `window`, and only to render a bech32 address — signing
 * goes through the raw CIP-30 api.
 *
 * No mount-time reads: the wallet is only consulted on explicit connect() so
 * the browser doesn't surprise the user with a pop-up on page load.
 */
export const useCardanoWallet = () => {
  const cardanoAddress = useWalletStates((s) => s.cardanoAddress);
  const setCardanoAddress = useWalletStates((s) => s.setCardanoAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const connect = useCallback(async () => {
    const key = pickWalletKey();
    const provider = key ? getInjectedWallets()?.[key] : null;
    if (!key || !provider) {
      throw new Error("No Cardano wallet detected. Install Lace or Eternl.");
    }
    const api = await provider.enable();
    enabledWallet = { key, api };

    // CIP-30 returns CBOR-hex addresses; Mesh's BrowserWallet converts them
    // to the bech32 (addr1…) form users and explorers expect.
    const { BrowserWallet } = await import("@meshsdk/core");
    const wallet = await BrowserWallet.enable(key);
    const address = await wallet.getChangeAddress();

    setCardanoAddress(address);
    setChainFamily("cardano");
    return address;
  }, [setCardanoAddress, setChainFamily]);

  const disconnect = useCallback(async () => {
    // CIP-30 has no programmatic disconnect — just drop our handle and state.
    enabledWallet = null;
    setCardanoAddress(null);
    setChainFamily(null);
  }, [setCardanoAddress, setChainFamily]);

  /**
   * CIP-8 data signing over the raw CIP-30 api. Both returned fields are
   * hex-encoded COSE structures (COSE_Sign1 + COSE_Key) — the server verifies
   * them; nothing here needs to decode them.
   */
  const signData = useCallback(async (message: string) => {
    const api = enabledWallet?.api;
    if (!api) {
      throw new Error("Connect a Cardano wallet before signing");
    }
    const changeAddressHex = await api.getChangeAddress();
    const { signature, key } = await api.signData(
      changeAddressHex,
      toHex(message),
    );
    return { signature, key };
  }, []);

  return {
    address: cardanoAddress,
    connect,
    disconnect,
    signData,
  };
};
