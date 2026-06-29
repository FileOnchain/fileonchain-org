"use client";

import { activate } from "@autonomys/auto-utils";
import {
  web3Accounts,
  web3Enable,
  web3FromSource,
} from "@polkadot/extension-dapp";
import { useEffect } from "react";
import { useWalletStates } from "@/states/wallet";
import { Account } from "@/types/types";

/**
 * useSubstrateWallet — Substrate-only wallet integration via polkadot.js
 * extension (Talisman, SubWallet, Polkadot.js, etc.). Phase 8 splits this
 * out of the original `useWallet` so each chain family has its own hook.
 */
export const useSubstrateWallet = () => {
  const networkId = useWalletStates((state) => state.networkId);
  const api = useWalletStates((state) => state.api);
  const setSelectedAccount = useWalletStates(
    (state) => state.setSelectedAccount,
  );
  const setAccounts = useWalletStates((state) => state.setAccounts);
  const setApi = useWalletStates((state) => state.setApi);
  const setChainFamily = useWalletStates((state) => state.setChainFamily);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const init = async () => {
      const extensions = await web3Enable("FileOnChain");
      if (extensions.length === 0) return;

      const allAccounts = await web3Accounts();
      setAccounts(allAccounts as Account[]);
    };

    void init();
  }, [setAccounts]);

  useEffect(() => {
    const connectApi = async () => {
      const instance = await activate({ networkId });
      setApi(instance);
    };
    void connectApi();
  }, [networkId, setApi]);

  const connectWallet = async (account: Account) => {
    if (!account || !api || typeof window === "undefined") return;
    const injector = await web3FromSource(account.meta.source);
    api.setSigner(injector.signer);
    setSelectedAccount(account);
    setChainFamily("substrate");
  };

  const disconnect = () => {
    setSelectedAccount(null);
    setAccounts([]);
    setChainFamily(null);
  };

  return { connectWallet, disconnect };
};