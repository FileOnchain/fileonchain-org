"use client";

import { useCallback } from "react";
import { useWalletStates } from "@/states/wallet";
import { trackEvent } from "@/lib/analytics";

// `useSuiWallet` subscribes to the wallet-standard registry directly
// (`wallet-standard:register-wallet` / `app-ready` window events) and calls
// `standard:connect` / `standard:disconnect` / `sui:signPersonalMessage`
// features on the discovered wallet. `@mysten/dapp-kit` would add React
// context helpers + a discovery modal — out of scope per the project's
// "targeted, not all 12" wallet-adapter directive.

interface WalletStandardAccount {
  address: string;
  publicKey: Uint8Array;
}

interface WalletStandardWallet {
  name: string;
  chains: readonly string[];
  features: Record<string, unknown>;
  accounts: readonly WalletStandardAccount[];
}

interface StandardConnectFeature {
  connect(): Promise<{ accounts: WalletStandardAccount[] }>;
}

interface StandardDisconnectFeature {
  disconnect(): Promise<void>;
}

interface SuiSignPersonalMessageFeature {
  signPersonalMessage(input: {
    message: Uint8Array;
    account: WalletStandardAccount;
  }): Promise<{ bytes: string; signature: string }>;
}

/**
 * Minimal wallet-standard discovery, dependency-free. Wallets injected before
 * us dispatch "wallet-standard:register-wallet"; the rest listen for our
 * "wallet-standard:app-ready" and call `detail.register(wallet)`. The
 * listener is registered once and every discovered wallet accumulates in
 * `discovered`.
 */
const discovered: WalletStandardWallet[] = [];
let listening = false;

const collectWallets = (): WalletStandardWallet[] => {
  if (typeof window === "undefined") return [];
  const register = (wallet: WalletStandardWallet) => {
    if (!discovered.includes(wallet)) discovered.push(wallet);
  };
  if (!listening) {
    listening = true;
    window.addEventListener("wallet-standard:register-wallet", ((
      event: CustomEvent<(api: { register: typeof register }) => void>,
    ) => {
      event.detail({ register });
    }) as EventListener);
  }
  window.dispatchEvent(
    new CustomEvent("wallet-standard:app-ready", { detail: { register } }),
  );
  return discovered.filter((w) => w.chains.some((c) => c.startsWith("sui:")));
};

/** Module-level connection cache so the anchor sender can reuse the wallet. */
let connectedWallet: WalletStandardWallet | null = null;
let connectedAccount: WalletStandardAccount | null = null;

/** The wallet + account the user connected via useSuiWallet, for senders. */
export const getConnectedSuiWallet = (): {
  wallet: WalletStandardWallet;
  account: WalletStandardAccount;
} | null => {
  if (!connectedWallet || !connectedAccount) return null;
  return { wallet: connectedWallet, account: connectedAccount };
};

/**
 * useSuiWallet — connects to Slush / other Sui wallets via the wallet
 * standard's window events. No mount-time reads: the wallet is only
 * consulted on explicit connect() so the browser doesn't surprise the user
 * with a pop-up on page load.
 */
export const useSuiWallet = () => {
  const suiAddress = useWalletStates((s) => s.suiAddress);
  const setSuiAddress = useWalletStates((s) => s.setSuiAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const connect = useCallback(async () => {
    const [wallet] = collectWallets();
    if (!wallet) {
      throw new Error(
        "No Sui wallet detected. Install Slush or another wallet-standard Sui wallet.",
      );
    }
    const { accounts } = await (
      wallet.features["standard:connect"] as StandardConnectFeature
    ).connect();
    const account = accounts[0];
    if (!account) {
      throw new Error("The Sui wallet returned no accounts");
    }
    connectedWallet = wallet;
    connectedAccount = account;
    setSuiAddress(account.address);
    setChainFamily("sui");
    trackEvent("wallet_connect", { family: "sui" });
    return account.address;
  }, [setSuiAddress, setChainFamily]);

  const disconnect = useCallback(async () => {
    const feature = connectedWallet?.features["standard:disconnect"] as
      | StandardDisconnectFeature
      | undefined;
    if (feature?.disconnect) {
      try {
        await feature.disconnect();
      } catch {
        // ignore
      }
    }
    connectedWallet = null;
    connectedAccount = null;
    setSuiAddress(null);
    setChainFamily(null);
  }, [setSuiAddress, setChainFamily]);

  /**
   * `sui:signPersonalMessage` over a plain-text message; the wallet returns
   * both the signature and the signed bytes as base64.
   */
  const signPersonalMessage = useCallback(
    async (message: string) => {
      if (!suiAddress) {
        throw new Error("Connect a Sui wallet before signing");
      }
      // Re-discover so a page reload with a persisted address still signs.
      const wallet =
        connectedWallet ??
        collectWallets().find((w) =>
          w.accounts.some((a) => a.address === suiAddress),
        ) ??
        null;
      const account =
        connectedAccount ??
        wallet?.accounts.find((a) => a.address === suiAddress) ??
        null;
      const feature = wallet?.features["sui:signPersonalMessage"] as
        | SuiSignPersonalMessageFeature
        | undefined;
      if (!wallet || !account || !feature?.signPersonalMessage) {
        throw new Error("The connected Sui wallet cannot sign messages");
      }
      const { bytes, signature } = await feature.signPersonalMessage({
        message: new TextEncoder().encode(message),
        account,
      });
      return { signature, bytes };
    },
    [suiAddress],
  );

  return {
    address: suiAddress,
    connect,
    disconnect,
    signPersonalMessage,
  };
};
