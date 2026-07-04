"use client";

import { useCallback } from "react";
import { createPublicClient, createWalletClient, custom, http, type WalletClient } from "viem";
import { mainnet } from "viem/chains";
import { useWalletStates } from "@/states/wallet";
import { getChain } from "@fileonchain/sdk";
import { trackEvent } from "@/lib/analytics";

/* TODO: wire to viem WalletClient — currently only stubs the connection */

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

/**
 * useEVMWallet — EVM wallet integration via injected providers (MetaMask,
 * Rabby, Coinbase Wallet, Brave). Uses viem for client construction; reads
 * the address via `eth_accounts`, requests connection via `eth_requestAccounts`.
 *
 * No mount-time reads: the wallet is only consulted when the user explicitly
 * clicks "Connect Wallet" to avoid surprise pop-ups on page load.
 */
export const useEVMWallet = () => {
  const evmAddress = useWalletStates((s) => s.evmAddress);
  const setEvmAddress = useWalletStates((s) => s.setEvmAddress);
  const setChainFamily = useWalletStates((s) => s.setChainFamily);

  const getProvider = (): EthereumProvider | null => {
    if (typeof window === "undefined") return null;
    return window.ethereum ?? null;
  };

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      throw new Error("No injected EVM wallet detected. Install MetaMask or Rabby.");
    }
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    if (!accounts || accounts.length === 0) {
      throw new Error("No account selected");
    }
    setEvmAddress(accounts[0] as `0x${string}`);
    setChainFamily("evm");
    trackEvent("wallet_connect", { family: "evm" });
    return accounts[0] as `0x${string}`;
  }, [setEvmAddress, setChainFamily]);

  const disconnect = useCallback(() => {
    setEvmAddress(null);
    setChainFamily(null);
  }, [setEvmAddress, setChainFamily]);

  const getPublicClient = useCallback(() => {
    return createPublicClient({
      chain: mainnet,
      transport: http(),
    });
  }, []);

  const getWalletClient = useCallback((): WalletClient | null => {
    const provider = getProvider();
    if (!provider) return null;
    const cfg = getChain("evm:1");
    if (!cfg) return null;
    return createWalletClient({
      chain: mainnet,
      transport: custom(provider as never),
    });
  }, []);

  /**
   * personal_sign over a plain-text message (wallet sign-in / linking).
   * `address` overrides the store value — needed right after connect(),
   * before the state update lands.
   */
  const signMessage = useCallback(
    async (
      message: string,
      address?: `0x${string}`,
    ): Promise<`0x${string}`> => {
      const account = address ?? evmAddress;
      const walletClient = getWalletClient();
      if (!walletClient || !account) {
        throw new Error("Connect an EVM wallet before signing");
      }
      return walletClient.signMessage({ account, message });
    },
    [getWalletClient, evmAddress],
  );

  return {
    address: evmAddress,
    connect,
    disconnect,
    getPublicClient,
    getWalletClient,
    signMessage,
  };
};