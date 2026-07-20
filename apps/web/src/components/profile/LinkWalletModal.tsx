"use client";

import * as React from "react";
import { FiLink, FiX } from "react-icons/fi";
import { CHAIN_FAMILY_LABELS, type ChainFamily } from "@fileonchain/sdk";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import RuntimeChip from "@/components/profile/RuntimeChip";
import { useIdentityStates } from "@/states/identity";
import { useWalletStates } from "@/states/wallet";
import { useAccountWallets } from "@/hooks/useAccountWallets";
import { WALLET_FAMILIES } from "@/lib/auth/wallet-message";
import { mockLinkedAddress } from "@/lib/mock/wallet-fakes";
import { truncateAddress } from "@/lib/cid/format";
import { trackEvent } from "@/lib/analytics";

/** Linkable = auth-capable: proof collection + server verification exist. */
const FAMILIES: readonly ChainFamily[] = WALLET_FAMILIES;

interface LinkWalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The profile's canonical address — the identity other wallets attach to. */
  primaryAddress: string;
  primaryFamily: ChainFamily;
}

/**
 * LinkWalletModal — attach one wallet per runtime family to the identity.
 *
 * Signed in: the target wallet signs a nonce challenge and the link is
 * verified and stored server-side (`POST /api/wallets/link`), then mirrored
 * into the local identity store so the profile updates immediately.
 *
 * Anonymous: the legacy demo path — a simulated signature recorded only in
 * localStorage.
 *
 * TODO: also submit the attestation to the onchain identity registry once it
 * exists, with a counter-signature from the primary wallet.
 */
export const LinkWalletModal = ({
  open,
  onOpenChange,
  primaryAddress,
  primaryFamily,
}: LinkWalletModalProps) => {
  const { toast } = useToast();
  const {
    authed,
    linkWallet: linkAccountWallet,
    unlinkWallet: unlinkAccountWallet,
  } = useAccountWallets();

  const linked = useIdentityStates((s) => s.linked);
  const linkWallet = useIdentityStates((s) => s.linkWallet);
  const unlinkWallet = useIdentityStates((s) => s.unlinkWallet);

  const walletStates = useWalletStates();
  const substrateAccount = walletStates.selectedAccount;

  const [pending, setPending] = React.useState<ChainFamily | null>(null);

  /** Prefer a genuinely connected wallet for the family; fall back to a mock. */
  const candidateAddress = (family: ChainFamily): string => {
    const connected =
      family === "substrate"
        ? substrateAccount?.address ?? null
        : (walletStates[`${family}Address` as const] as string | null);
    return connected ?? mockLinkedAddress(primaryAddress, family);
  };

  const handleLink = async (family: ChainFamily) => {
    setPending(family);
    try {
      let address: string;
      if (authed) {
        // Real proof of control: nonce → wallet signature → server verify.
        const wallet = await linkAccountWallet(family);
        address = wallet.address;
      } else {
        // Anonymous demo path — simulated signature, localStorage only.
        await new Promise((r) => setTimeout(r, 900));
        address = candidateAddress(family);
        trackEvent("wallet_link", { family, action: "link" });
      }
      linkWallet({ family, address, linkedAt: Math.floor(Date.now() / 1000) });
      toast({
        title: "Wallet linked",
        description: `${CHAIN_FAMILY_LABELS[family]} · ${truncateAddress(address)} now counts toward this identity.`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Linking failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "danger",
      });
    } finally {
      setPending(null);
    }
  };

  const handleUnlink = async (family: ChainFamily) => {
    if (authed) {
      try {
        await unlinkAccountWallet(family);
      } catch {
        toast({ title: "Unlink failed", variant: "danger" });
        return;
      }
    } else {
      trackEvent("wallet_link", { family, action: "unlink" });
    }
    unlinkWallet(family);
    toast({
      title: "Wallet unlinked",
      description: `${CHAIN_FAMILY_LABELS[family]} wallet removed from this identity.`,
      variant: "default",
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Link wallets"
      description="One wallet per runtime. Linked wallets share a single profile, so anchors from any of them count toward the same leaderboard rank."
    >
      <ul className="space-y-2">
        {FAMILIES.map((family) => {
          const isPrimary = family === primaryFamily;
          const entry = linked.find((w) => w.family === family);
          const isPending = pending === family;
          return (
            <li
              key={family}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <RuntimeChip family={family} active={isPrimary || Boolean(entry)} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {CHAIN_FAMILY_LABELS[family]}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted">
                    {isPrimary
                      ? `${truncateAddress(primaryAddress)} · primary`
                      : entry
                        ? truncateAddress(entry.address)
                        : "Not linked"}
                  </p>
                </div>
              </div>
              {isPrimary ? (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Primary
                </span>
              ) : entry ? (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<FiX size={14} />}
                  onClick={() => void handleUnlink(family)}
                >
                  Unlink
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={isPending}
                  leftIcon={<FiLink size={14} />}
                  onClick={() => void handleLink(family)}
                >
                  {isPending ? "Signing…" : "Link"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-muted">
        {authed
          ? "Linking asks the target wallet to sign a one-time challenge; verified links are stored on your account."
          : "You're browsing anonymously — links are simulated and stored locally. Sign in to store verified, signature-backed links on your account."}
      </p>
    </Modal>
  );
};

export default LinkWalletModal;
