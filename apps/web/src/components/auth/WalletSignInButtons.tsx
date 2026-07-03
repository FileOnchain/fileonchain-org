"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { CHAIN_FAMILY_LABELS, type ChainFamily } from "@fileonchain/sdk";
import Button from "@/components/ui/Button";
import { useEVMWallet } from "@/hooks/useEVMWallet";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { useAptosWallet } from "@/hooks/useAptosWallet";
import { useWalletStates } from "@/states/wallet";
import { buildWalletMessage } from "@/lib/auth/wallet-message";
import { trackEvent } from "@/lib/analytics";

interface WalletSignInButtonsProps {
  /** Same-site path to land on after sign-in. */
  next: string;
}

interface WalletProof {
  address: string;
  signature: string;
  nonce: string;
  publicKey?: string;
  fullMessage?: string;
}

const requestNonce = async (
  family: ChainFamily,
  address: string,
): Promise<{ nonce: string; issuedAt: string }> => {
  const res = await fetch("/api/auth/wallet/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ family, address }),
  });
  if (!res.ok) throw new Error("Could not issue a sign-in nonce");
  return res.json();
};

/**
 * Wallet sign-in for all four runtime families: connect → fetch a single-use
 * nonce → sign the challenge → exchange the proof for a session via the
 * "wallet" Credentials provider.
 *
 * The substrate flow talks to @polkadot/extension-dapp lazily on click (not
 * through useWallet) so merely rendering /login never triggers the extension
 * authorization pop-up.
 */
export const WalletSignInButtons = ({ next }: WalletSignInButtonsProps) => {
  const router = useRouter();
  const [pending, setPending] = React.useState<ChainFamily | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const evm = useEVMWallet();
  const solana = useSolanaWallet();
  const aptos = useAptosWallet();
  const substrateAccount = useWalletStates((s) => s.selectedAccount);

  const collectProof = async (family: ChainFamily): Promise<WalletProof> => {
    switch (family) {
      case "evm": {
        const address = evm.address ?? (await evm.connect());
        const { nonce, issuedAt } = await requestNonce(family, address);
        const message = buildWalletMessage({ family, address, nonce, issuedAt });
        const signature = await evm.signMessage(message, address);
        return { address, signature, nonce };
      }
      case "solana": {
        const address = solana.address ?? (await solana.connect());
        const { nonce, issuedAt } = await requestNonce(family, address);
        const message = buildWalletMessage({ family, address, nonce, issuedAt });
        const signature = await solana.signMessage(message);
        return { address, signature, nonce };
      }
      case "aptos": {
        const address = aptos.address ?? (await aptos.connect());
        const { nonce, issuedAt } = await requestNonce(family, address);
        const message = buildWalletMessage({ family, address, nonce, issuedAt });
        const { signature, fullMessage, publicKey } = await aptos.signMessage(
          message,
          nonce,
        );
        return { address, signature, nonce, publicKey, fullMessage };
      }
      case "substrate": {
        const { web3Enable, web3Accounts, web3FromSource } = await import(
          "@polkadot/extension-dapp"
        );
        const { stringToHex } = await import("@polkadot/util");
        const extensions = await web3Enable("FileOnChain");
        if (extensions.length === 0) {
          throw new Error(
            "No Substrate extension detected. Install SubWallet or polkadot.js.",
          );
        }
        const accounts = await web3Accounts();
        const account =
          (substrateAccount &&
            accounts.find((a) => a.address === substrateAccount.address)) ??
          accounts[0];
        if (!account) throw new Error("No Substrate account available");
        const address = account.address;
        const { nonce, issuedAt } = await requestNonce(family, address);
        const message = buildWalletMessage({ family, address, nonce, issuedAt });
        const injector = await web3FromSource(account.meta.source);
        const signRaw = injector.signer?.signRaw;
        if (!signRaw) {
          throw new Error("The selected extension does not support raw signing");
        }
        const { signature } = await signRaw({
          address,
          data: stringToHex(message),
          type: "bytes",
        });
        return { address, signature, nonce };
      }
    }
  };

  const handleSignIn = async (family: ChainFamily) => {
    setPending(family);
    setError(null);
    try {
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
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet sign-in failed");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {(["evm", "substrate", "solana", "aptos"] as const).map((family) => (
        <Button
          key={family}
          variant="secondary"
          fullWidth
          isLoading={pending === family}
          disabled={pending !== null && pending !== family}
          onClick={() => void handleSignIn(family)}
        >
          {CHAIN_FAMILY_LABELS[family]} wallet
        </Button>
      ))}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
};

export default WalletSignInButtons;
