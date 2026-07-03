"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FiCheckCircle, FiKey, FiLogIn } from "react-icons/fi";
import type { ChainFamily } from "@fileonchain/sdk";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAccountWallets } from "@/hooks/useAccountWallets";
import { truncateAddress } from "@/lib/cid/format";

interface WalletAccountPanelProps {
  family: ChainFamily;
  /** Address of the wallet connected for this family (panel hidden when null). */
  address: string | null;
  /** Called after a successful sign-in so the parent can close the modal. */
  onSignedIn?: () => void;
}

/**
 * WalletAccountPanel — ties the wallet a user just connected to their
 * account, in both directions:
 *
 * - signed out → "Sign in with this wallet" (creates the account on first
 *   use), so connecting doubles as sign-up;
 * - signed in → "Verify ownership" (sign-message → server-verified link),
 *   or a verified check once the wallet is linked.
 */
export const WalletAccountPanel = ({
  family,
  address,
  onSignedIn,
}: WalletAccountPanelProps) => {
  const router = useRouter();
  const { toast } = useToast();
  const {
    authed,
    sessionStatus,
    loaded,
    isLinked,
    linkWallet,
    signInWithWallet,
  } = useAccountWallets();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!address || sessionStatus === "loading") return null;

  const linked = isLinked(family, address);

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithWallet(family);
      toast({
        title: "Signed in",
        description: `${truncateAddress(address)} is now your account wallet.`,
        variant: "success",
      });
      onSignedIn?.();
      // Single follow-up router action (no push alongside) — re-renders
      // server components with the new session cookie.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const wallet = await linkWallet(family);
      toast({
        title: "Wallet verified",
        description: `${truncateAddress(wallet.address)} is linked to your account.`,
        variant: "success",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-3">
      {!authed ? (
        <>
          <Button
            fullWidth
            variant="secondary"
            isLoading={busy}
            leftIcon={<FiLogIn aria-hidden />}
            onClick={() => void handleSignIn()}
          >
            Sign in with this wallet
          </Button>
          <p className="mt-2 text-xs text-muted">
            Sign a one-time message to prove ownership. Creates your
            FileOnChain account if you don&apos;t have one — no email needed.
          </p>
        </>
      ) : linked ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <FiCheckCircle aria-hidden />
          Ownership verified — linked to your account
        </p>
      ) : (
        <>
          <Button
            fullWidth
            variant="secondary"
            isLoading={busy || !loaded}
            leftIcon={<FiKey aria-hidden />}
            onClick={() => void handleLink()}
          >
            Verify ownership &amp; link to account
          </Button>
          <p className="mt-2 text-xs text-muted">
            Sign a one-time message so this wallet counts toward your account
            and profile. One wallet per runtime — relinking replaces it.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
};

export default WalletAccountPanel;
