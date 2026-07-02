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
import { mockLinkedAddress } from "@/lib/mock/profiles";
import { truncateAddress } from "@/lib/cid/format";
import { trackEvent } from "@/lib/analytics";

const FAMILIES: ChainFamily[] = ["evm", "substrate", "solana", "aptos"];

interface LinkWalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The profile's canonical address — the identity other wallets attach to. */
  primaryAddress: string;
  primaryFamily: ChainFamily;
}

/**
 * LinkWalletModal — attach one wallet per runtime family to the connected
 * identity. The mock flow simulates the dual-signature handshake and records
 * the link locally.
 *
 * TODO: wire to the real identity registry — linking must collect a signed
 * message from BOTH wallets (proof of control) and submit the attestation
 * onchain; unlinking revokes it.
 */
export const LinkWalletModal = ({
  open,
  onOpenChange,
  primaryAddress,
  primaryFamily,
}: LinkWalletModalProps) => {
  const { toast } = useToast();
  const linked = useIdentityStates((s) => s.linked);
  const linkWallet = useIdentityStates((s) => s.linkWallet);
  const unlinkWallet = useIdentityStates((s) => s.unlinkWallet);

  const evmAddress = useWalletStates((s) => s.evmAddress);
  const solanaAddress = useWalletStates((s) => s.solanaAddress);
  const aptosAddress = useWalletStates((s) => s.aptosAddress);
  const substrateAccount = useWalletStates((s) => s.selectedAccount);

  const [pending, setPending] = React.useState<ChainFamily | null>(null);

  /** Prefer a genuinely connected wallet for the family; fall back to a mock. */
  const candidateAddress = (family: ChainFamily): string => {
    const connected =
      family === "evm"
        ? evmAddress
        : family === "solana"
          ? solanaAddress
          : family === "aptos"
            ? aptosAddress
            : substrateAccount?.address ?? null;
    return connected ?? mockLinkedAddress(primaryAddress, family);
  };

  const handleLink = async (family: ChainFamily) => {
    setPending(family);
    // Simulates requesting a proof-of-control signature from the target wallet.
    await new Promise((r) => setTimeout(r, 900));
    const address = candidateAddress(family);
    linkWallet({ family, address, linkedAt: Math.floor(Date.now() / 1000) });
    setPending(null);
    trackEvent("wallet_link", { family, action: "link" });
    toast({
      title: "Wallet linked",
      description: `${CHAIN_FAMILY_LABELS[family]} · ${truncateAddress(address)} now counts toward this identity.`,
      variant: "success",
    });
  };

  const handleUnlink = (family: ChainFamily) => {
    unlinkWallet(family);
    trackEvent("wallet_link", { family, action: "unlink" });
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
                  onClick={() => handleUnlink(family)}
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
        Linking requires proof of control — a signed message from both wallets.
        This demo simulates the signature and records the link locally.
      </p>
    </Modal>
  );
};

export default LinkWalletModal;
