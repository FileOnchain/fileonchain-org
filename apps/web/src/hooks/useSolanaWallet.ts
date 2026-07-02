"use client";

import { useCallback, useEffect } from "react";
import { useWalletStates } from "@/states/wallet";

/* TODO: wire to wallet-adapter for Phantom / Solflare standard flow */

interface SolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toBytes: () => Uint8Array; toBase58: () => string };
  connect: () => Promise<{ publicKey: { toBase58: () => string } }>;
  disconnect: () => Promise<void>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
  }
}

/**
 * useSolanaWallet — connects to Phantom / Solflare via the global
 * `window.solana` provider. The `@solana/web3.js` Connection / PublicKey are
 * loaded lazily so SSR doesn't trip over `window`/`crypto` polyfill checks.
 */
export const useSolanaWallet = () => {
  const solanaAddress = useWalletStates((s) => s.solanaAddress);
  const setSolanaAddress = useWalletStates((s) => s.setSolanaAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const getProvider = (): SolanaProvider | null => {
    if (typeof window === "undefined") return null;
    return window.phantom?.solana ?? window.solana ?? null;
  };

  useEffect(() => {
    const provider = getProvider();
    if (!provider?.on) return;

    const handleAccountChange = (pk: unknown) => {
      const addr =
        (pk as { toBase58?: () => string } | null)?.toBase58?.() ??
        (typeof pk === "string" ? pk : null);
      if (addr) {
        setSolanaAddress(addr);
        setChainFamily("solana");
      }
    };

    provider.on("accountChanged", handleAccountChange);
    return () => {
      provider.removeListener?.("accountChanged", handleAccountChange);
    };
  }, [setSolanaAddress, setChainFamily]);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      throw new Error("No Solana wallet detected. Install Phantom or Solflare.");
    }
    const { publicKey } = await provider.connect();
    const address = publicKey.toBase58();
    setSolanaAddress(address);
    setChainFamily("solana");
    return address;
  }, [setSolanaAddress, setChainFamily]);

  const disconnect = useCallback(async () => {
    const provider = getProvider();
    if (provider?.disconnect) {
      try {
        await provider.disconnect();
      } catch {
        // ignore
      }
    }
    setSolanaAddress(null);
    setChainFamily(null);
  }, [setSolanaAddress, setChainFamily]);

  const getConnection = useCallback(async () => {
    const { Connection } = await import("@solana/web3.js");
    const { getChain } = await import("@fileonchain/sdk");
    const mainnet = getChain("solana:mainnet");
    return new Connection(mainnet?.rpcUrl ?? "https://api.mainnet-beta.solana.com");
  }, []);

  const getPublicKey = useCallback(async () => {
    if (!solanaAddress) return null;
    try {
      const { PublicKey } = await import("@solana/web3.js");
      return new PublicKey(solanaAddress);
    } catch {
      return null;
    }
  }, [solanaAddress]);

  return { address: solanaAddress, connect, disconnect, getConnection, getPublicKey };
};