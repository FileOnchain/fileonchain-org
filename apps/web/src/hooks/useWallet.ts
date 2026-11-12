"use client";

import { Account } from "@/types/types";

/**
 * useWallet: Substrate signing helpers for the upload flow.
 *
 * Deliberately has no mount-time effects. Calling `web3Enable` on render
 * made SubWallet / Talisman / polkadot.js pop an authorization request on
 * every page that renders the uploader, before the visitor had even seen
 * the page. The extension is now authorized lazily, only when the user
 * actually signs. Connecting (account list + RPC activate) lives in
 * `useSubstrateWallet`, mounted only once the Substrate connect step opens.
 */
export const useWallet = () => {
  /** signRaw over a plain-text message (wallet sign-in / linking). */
  const signMessage = async (
    account: Account,
    message: string,
  ): Promise<string> => {
    const { web3Enable, web3FromSource } = await import(
      "@polkadot/extension-dapp"
    );
    const { stringToHex } = await import("@polkadot/util");
    // web3FromSource requires a prior web3Enable in this page session.
    await web3Enable("FileOnChain");
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

  return { signMessage };
};
