"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { FiDroplet, FiZap } from "react-icons/fi";
import type { ChainId } from "@fileonchain/sdk";
import { useChain } from "@/hooks/useChain";
import { useWalletStates } from "@/states/wallet";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import {
  ANCHOR_ESCROW,
  FOCAT_PACKS,
  MAX_CUSTOM_FOCAT,
  formatFocat,
  isProtocolChain,
  packPriceUsd,
  type FocatPackId,
} from "@/lib/focat";

interface FocatOrder {
  id: string;
  chainId: ChainId;
  focatAmount: number;
  status: string;
  txHash: string | null;
}

/**
 * FocatTopUp — the only place the webapp asks anyone to acquire FOCAT, and
 * it appears only where the wallet path requires it: pay-as-you-go on a
 * propose/verify chain, where the user's own wallet escrows the tip + the
 * refundable bond. Credits users never see this (the server worker holds
 * the FOCAT). Mainnets sell fixed-price anchor packs paid from account
 * credits; testnets drip from a free faucet — the two are never mixed.
 *
 * Balance is derived from the user's fulfilled pack orders on this chain.
 * TODO: read the real wallet balance via the SDK (getTokenBalance) once the
 * chain is propose-provisioned, and replace mock fulfillment with treasury
 * transfers.
 */
export const FocatTopUp = () => {
  const { status: sessionStatus } = useSession();
  const authed = sessionStatus === "authenticated";
  const { activeChain } = useChain();
  const selectedAccount = useWalletStates((state) => state.selectedAccount);
  const { toast } = useToast();

  const [open, setOpen] = React.useState(false);
  const [packId, setPackId] = React.useState<FocatPackId>("anchor-pack");
  const [customFocat, setCustomFocat] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastOrder, setLastOrder] = React.useState<FocatOrder | null>(null);
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

  const effectiveAmount =
    packId === "custom"
      ? Number(customFocat) || 0
      : (FOCAT_PACKS.find((pack) => pack.id === packId)?.focatAmount ?? 0);
  const priceUsd = packPriceUsd(effectiveAmount);
  const anchorPack = FOCAT_PACKS[0];
  const anchorPackPrice = packPriceUsd(anchorPack.focatAmount ?? 0);
  const needsTopUp = balance !== null && balance < escrowFocat;

  const handleOrder = async () => {
    if (!selectedAccount) {
      setError("Connect the wallet that will anchor first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/focat/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: activeChain.id,
          packId,
          walletAddress: selectedAccount.address,
          customFocat: packId === "custom" ? Number(customFocat) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Order failed");
      setLastOrder(data.order as FocatOrder);
      await refreshBalance();
      toast({
        title: activeChain.testnet ? "Test FOCAT sent" : "Anchor pack sent",
        description: `${formatFocat((data.order as FocatOrder).focatAmount)} on ${activeChain.name}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy(false);
    }
  };

  const closeModal = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setLastOrder(null);
      setError(null);
    }
  };

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
                Your pack balance here: <span className="text-foreground">{formatFocat(balance)}</span>.
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

      <Modal
        open={open}
        onOpenChange={closeModal}
        title={
          activeChain.testnet
            ? `Test FOCAT on ${activeChain.name}`
            : `FOCAT on ${activeChain.name}`
        }
        description={
          activeChain.testnet
            ? "Free faucet drip for QA — testnets never sell packs."
            : "A verification-fee top-up, not a token sale: enough FOCAT to propose on this chain, delivered to your connected wallet."
        }
        size="md"
      >
        {!authed ? (
          <p className="text-sm text-muted">
            <Link href="/login?next=/" className="text-primary hover:underline">
              Sign in
            </Link>{" "}
            to get FOCAT — packs are paid from your account credits. Prefer staying wallet-only?
            Acquire FOCAT externally and anchor as usual.
          </p>
        ) : lastOrder ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              {formatFocat(lastOrder.focatAmount)} sent to{" "}
              <span className="font-mono text-xs">
                {selectedAccount
                  ? `${selectedAccount.address.slice(0, 6)}…${selectedAccount.address.slice(-4)}`
                  : "your wallet"}
              </span>{" "}
              on {activeChain.name}.
            </p>
            {lastOrder.txHash && (
              <p className="break-all font-mono text-xs text-muted">tx {lastOrder.txHash}</p>
            )}
            <p className="text-xs text-muted">
              You&apos;re set for {Math.floor(lastOrder.focatAmount / escrowFocat) || 1}{" "}
              verified anchor(s) — the bond portion comes back after each verification.
            </p>
            <Button onClick={() => closeModal(false)}>Done</Button>
          </div>
        ) : activeChain.testnet ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Drips {formatFocat(110)} to your connected wallet — enough for one propose (tip +
              bond + buffer).
            </p>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button onClick={() => void handleOrder()} isLoading={busy}>
              Request drip
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              {FOCAT_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setPackId(pack.id)}
                  aria-pressed={packId === pack.id}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors",
                    packId === pack.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-surface hover:bg-surface-elevated",
                  )}
                >
                  <span className="flex items-center justify-between text-sm font-medium text-foreground">
                    <span>{pack.name}</span>
                    <span>
                      {pack.focatAmount !== null
                        ? `${formatFocat(pack.focatAmount)} · $${packPriceUsd(pack.focatAmount).toFixed(2)}`
                        : customFocat
                          ? `$${priceUsd.toFixed(2)}`
                          : ""}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted">{pack.description}</span>
                  {pack.id === "custom" && packId === "custom" && (
                    <Input
                      type="number"
                      min={1}
                      max={MAX_CUSTOM_FOCAT}
                      value={customFocat}
                      onChange={(event) => setCustomFocat(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      placeholder="Amount of FOCAT"
                      className="mt-2"
                      aria-label="Custom FOCAT amount"
                    />
                  )}
                </button>
              ))}
            </div>

            <p className="text-xs text-muted">
              Delivered to{" "}
              {selectedAccount ? (
                <span className="font-mono">
                  {selectedAccount.address.slice(0, 8)}…{selectedAccount.address.slice(-6)}
                </span>
              ) : (
                "your connected wallet (connect one first)"
              )}{" "}
              on {activeChain.name}. FOCAT is chain-specific until bridged. Paid from your USD
              credits at a fixed rate — validators can skip buying entirely and earn FOCAT from
              verification tips instead.
            </p>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <Button
              onClick={() => void handleOrder()}
              isLoading={busy}
              disabled={effectiveAmount <= 0 || !selectedAccount}
            >
              Pay ${priceUsd.toFixed(2)} with credits
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default FocatTopUp;
