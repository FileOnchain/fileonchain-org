"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CHAIN_FAMILY_LABELS, type ChainFamily } from "@fileonchain/sdk";
import Button from "@/components/ui/Button";
import { useAccountWallets } from "@/hooks/useAccountWallets";

interface WalletSignInButtonsProps {
  /** Same-site path to land on after sign-in. */
  next: string;
}

/**
 * Wallet sign-in for all four runtime families — thin buttons over
 * useAccountWallets.signInWithWallet (connect → nonce → sign → session).
 */
export const WalletSignInButtons = ({ next }: WalletSignInButtonsProps) => {
  const router = useRouter();
  const { signInWithWallet } = useAccountWallets();
  const [pending, setPending] = React.useState<ChainFamily | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleSignIn = async (family: ChainFamily) => {
    setPending(family);
    setError(null);
    try {
      await signInWithWallet(family);
      router.push(next);
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
