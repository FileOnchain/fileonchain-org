"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import type { ChainFamily } from "@fileonchain/sdk";
import { useWalletProof } from "@/hooks/useWalletProof";
import { normalizeAddress } from "@/lib/auth/wallet-message";
import { trackEvent } from "@/lib/analytics";

export interface AccountWallet {
  family: ChainFamily;
  address: string;
  verifiedAt: string;
}

/**
 * The bridge between wallet connection and the account session — one hook
 * for both directions of the same relationship:
 *
 * - signed out: `signInWithWallet(family)` turns the connected wallet into a
 *   session (creating an account on first use);
 * - signed in: `linkWallet(family)` proves ownership of the connected wallet
 *   via sign-message and stores the verified link on the account, and
 *   `isLinked(family, address)` reports the current state.
 *
 * Consumers: ChainConnectModal (verify/sign-in step after connecting),
 * LinkWalletModal (profile linking), dashboard surfaces.
 */
export const useAccountWallets = () => {
  const { status } = useSession();
  const authed = status === "authenticated";
  const { collectProof } = useWalletProof();

  const [linked, setLinked] = useState<AccountWallet[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!authed) {
      setLinked([]);
      setLoaded(true);
      return;
    }
    try {
      const res = await fetch("/api/wallets");
      if (res.ok) {
        const data = await res.json();
        setLinked(data.wallets as AccountWallet[]);
      }
    } catch {
      // Leave the previous snapshot; callers can retry via refresh().
    } finally {
      setLoaded(true);
    }
  }, [authed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isLinked = useCallback(
    (family: ChainFamily, address: string | null | undefined): boolean =>
      Boolean(
        address &&
          linked.some(
            (w) =>
              w.family === family &&
              w.address === normalizeAddress(family, address),
          ),
      ),
    [linked],
  );

  /** Prove ownership of a connected wallet and link it to the account. */
  const linkWallet = useCallback(
    async (family: ChainFamily): Promise<AccountWallet> => {
      const proof = await collectProof(family);
      const res = await fetch("/api/wallets/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proof),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Linking failed");
      }
      const data = await res.json();
      trackEvent("wallet_link", { family, action: "link" });
      await refresh();
      return data.wallet as AccountWallet;
    },
    [collectProof, refresh],
  );

  const unlinkWallet = useCallback(
    async (family: ChainFamily): Promise<void> => {
      const res = await fetch(`/api/wallets/${family}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error("Unlink failed");
      trackEvent("wallet_link", { family, action: "unlink" });
      await refresh();
    },
    [refresh],
  );

  /**
   * Sign in (or sign up) with a wallet — same proof, exchanged for a
   * session. Deliberately performs NO navigation/refresh: the caller owns
   * exactly one follow-up action. Stacking router.refresh() with a push or
   * a server redirect trips a Next 15.0.x Router bug ("Rendered more hooks
   * than during the previous render").
   */
  const signInWithWallet = useCallback(
    async (family: ChainFamily): Promise<void> => {
      const proof = await collectProof(family);
      const response = await signIn("wallet", {
        redirect: false,
        family,
        address: proof.address,
        signature: proof.signature,
        nonce: proof.nonce,
        publicKey: proof.publicKey ?? "",
        fullMessage: proof.fullMessage ?? "",
      });
      if (!response || response.error) {
        throw new Error("Signature verification failed — please try again");
      }
      trackEvent("auth_sign_in", { method: `wallet_${family}` });
    },
    [collectProof],
  );

  return {
    authed,
    sessionStatus: status,
    linked,
    loaded,
    isLinked,
    refresh,
    linkWallet,
    unlinkWallet,
    signInWithWallet,
  };
};
