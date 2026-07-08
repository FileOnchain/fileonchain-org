"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { FiDroplet, FiZap } from "react-icons/fi";
import type { ChainId } from "@fileonchain/sdk";
import { useChain } from "@/hooks/useChain";
import Button from "@/components/ui/Button";
import FocatPackModal from "@/components/focat/FocatPackModal";
import {
  ANCHOR_ESCROW,
  FOCAT_PACKS,
  formatFocat,
  isProtocolChain,
  packPriceUsd,
} from "@/lib/focat";

interface FocatOrder {
  id: string;
  chainId: ChainId;
  focatAmount: number;
  status: string;
}

/**
 * FocatTopUp — the upload flow's FOCAT affordance, shown only where the
 * wallet path requires the token: pay-as-you-go on a propose/verify chain,
 * where the user's own wallet escrows the tip + the refundable bond.
 * Credits users never see this (the server worker holds the FOCAT). The
 * purchase itself lives in the shared FocatPackModal, locked to the active
 * chain here; the dashboard offers the same modal with a chain picker.
 *
 * Balance is derived from the user's fulfilled pack orders on this chain.
 * TODO: read the real wallet balance via the SDK (getTokenBalance) once the
 * chain is propose-provisioned.
 */
export const FocatTopUp = () => {
  const { status: sessionStatus } = useSession();
  const authed = sessionStatus === "authenticated";
  const { activeChain } = useChain();

  const [open, setOpen] = React.useState(false);
  const [balance, setBalance] = React.useState<number | null>(null);

  const escrowFocat = ANCHOR_ESCROW.tipFocat + ANCHOR_ESCROW.bondFocat;

  const refreshBalance = React.useCallback(async () => {
    if (!authed) {
      setBalance(null);
      return;
    }
    try {
      const res = await fetch("/api/focat/orders");
      if (!res.ok) return;
      const data = (await res.json()) as { orders: FocatOrder[] };
      setBalance(
        data.orders
          .filter((order) => order.chainId === activeChain.id && order.status === "sent")
          .reduce((sum, order) => sum + order.focatAmount, 0),
      );
    } catch {
      // Balance is advisory; the panel stays usable without it.
    }
  }, [authed, activeChain.id]);

  React.useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  if (!isProtocolChain(activeChain)) return null;

  const anchorPack = FOCAT_PACKS[0];
  const anchorPackPrice = packPriceUsd(anchorPack.focatAmount ?? 0);
  const needsTopUp = balance !== null && balance < escrowFocat;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            FOCAT escrow on {activeChain.name}
          </p>
          <p className="mt-1 text-xs text-muted">
            Anchoring from your wallet escrows ~{formatFocat(escrowFocat)}:{" "}
            {ANCHOR_ESCROW.tipFocat} tip (kept, split with validators) +{" "}
            {ANCHOR_ESCROW.bondFocat} bond{" "}
            <span className="text-foreground">returned after verification</span>.
            {balance !== null && (
              <>
                {" "}
                Your pack balance here:{" "}
                <span className="text-foreground">{formatFocat(balance)}</span>.
              </>
            )}
          </p>
        </div>
        <Button
          variant={needsTopUp ? "primary" : "secondary"}
          leftIcon={activeChain.testnet ? <FiDroplet aria-hidden /> : <FiZap aria-hidden />}
          onClick={() => setOpen(true)}
        >
          {activeChain.testnet
            ? "Request test FOCAT — free"
            : `Get anchor pack — $${anchorPackPrice.toFixed(2)}`}
        </Button>
      </div>

      <FocatPackModal
        open={open}
        onOpenChange={setOpen}
        chainId={activeChain.id}
        onPurchased={() => void refreshBalance()}
      />
    </div>
  );
};

export default FocatTopUp;
