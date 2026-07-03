"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { CHAIN_FAMILY_LABELS, type ChainFamily } from "@fileonchain/sdk";
import Button from "@/components/ui/Button";
import { useWalletProof } from "@/hooks/useWalletProof";
import { trackEvent } from "@/lib/analytics";

interface WalletSignInButtonsProps {
  /** Same-site path to land on after sign-in. */
  next: string;
}

/**
 * Wallet sign-in for all four runtime families: collect a nonce-bound
 * signature via useWalletProof, then exchange it for a session through the
 * "wallet" Credentials provider.
 */
export const WalletSignInButtons = ({ next }: WalletSignInButtonsProps) => {
  const router = useRouter();
  const { collectProof } = useWalletProof();
  const [pending, setPending] = React.useState<ChainFamily | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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
