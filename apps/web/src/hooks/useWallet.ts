"use client";

import { activate } from "@autonomys/auto-utils";
import {
  web3Accounts,
  web3Enable,
  web3FromSource,
} from "@polkadot/extension-dapp";
import { stringToHex } from "@polkadot/util";
import { useEffect } from "react";
import { useWalletStates } from "@/states/wallet";
import { Account } from "@/types/types";
import { trackEvent } from "@/lib/analytics";

export const useWallet = () => {
  const networkId = useWalletStates((state) => state.networkId);
  const api = useWalletStates((state) => state.api);
  const setSelectedAccount = useWalletStates(
    (state) => state.setSelectedAccount
  );
  const setAccounts = useWalletStates((state) => state.setAccounts);
  const setApi = useWalletStates((state) => state.setApi);

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
    trackEvent("wallet_connect", { family: "substrate" });
  };

  /** signRaw over a plain-text message (wallet sign-in / linking). */
  const signMessage = async (
    account: Account,
    message: string,
  ): Promise<string> => {
    const injector = await web3FromSource(account.meta.source);
    const signRaw = injector.signer?.signRaw;
    if (!signRaw) {
      throw new Error("The selected extension does not support raw signing");
    }
    const { signature } = await signRaw({
      address: account.address,
      data: stringToHex(message),
      type: "bytes",
    });
    return signature;
  };

  return { connectWallet, signMessage };
};
