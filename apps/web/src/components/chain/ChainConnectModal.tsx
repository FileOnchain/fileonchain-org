"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiArrowRight, FiUser } from "react-icons/fi";
import { Modal } from "@/components/ui/Modal";
import { useChain } from "@/hooks/useChain";
import { useVisibleChains } from "@/hooks/useVisibleChains";
import { isChainActive, type ChainFamily } from "@fileonchain/sdk";
import { getFamilyAddress, useWalletStates } from "@/states/wallet";
import WalletConnectPanel from "@/components/chain/WalletConnectPanel";
import { truncateFileName } from "@/utils/truncateFileName";

const ADDRESS_MAX = 16;

interface ChainConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ChainConnectModal — the WalletConnectPanel (shared with /login) in a
 * modal. Adds the modal-only concerns: keeping the active anchoring chain
 * in step with the wallet the user just connected, and the public-profile
 * shortcut once a wallet is connected.
 */
export const ChainConnectModal = ({ open, onOpenChange }: ChainConnectModalProps) => {
  const router = useRouter();
  const { activeChain, setActiveChainId } = useChain();
  const visibleChains = useVisibleChains();

  const connectedAddress = useWalletStates((s) =>
    getFamilyAddress(s, s.chainFamily),
  );

  const close = () => onOpenChange(false);

  // Follow the connected wallet with the anchoring chain — but only onto a
  // chain that's open for uploads; families without an active chain leave
  // the current selection alone.
  const syncActiveChain = (family: ChainFamily) => {
    if (activeChain.family === family) return;
    const firstActive = visibleChains.find(
      (chain) => chain.family === family && isChainActive(chain),
    );
    if (firstActive) setActiveChainId(firstActive.id);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Connect wallet"
      description="Connect a wallet to sign in and anchor CIDs onchain."
      size="md"
    >
      <WalletConnectPanel
        initialFamily={activeChain.family}
        onConnected={syncActiveChain}
        onSignedIn={() => {
          close();
          // Single follow-up router action — re-renders server components
          // with the new session cookie.
          router.refresh();
        }}
      />

      {/* Public profile shortcut — appears once any wallet is connected. */}
      {connectedAddress && (
        <div className="mt-5 border-t border-border pt-4">
          <Link
            href={`/profile/${encodeURIComponent(connectedAddress)}`}
            onClick={close}
            className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors duration-base ease-out-soft hover:border-primary/40 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-primary">
              <FiUser size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                View public profile
              </span>
              <span className="block truncate font-mono text-[11px] text-muted">
                {truncateFileName(connectedAddress, ADDRESS_MAX)} · anchors, rank &amp; linked wallets
              </span>
            </span>
            <FiArrowRight
              size={14}
              className="shrink-0 text-muted transition-transform duration-base group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </Link>
        </div>
      )}
    </Modal>
  );
};

export default ChainConnectModal;
