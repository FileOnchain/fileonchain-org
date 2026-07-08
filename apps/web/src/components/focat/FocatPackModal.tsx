"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getChain, type ChainId } from "@fileonchain/sdk";
import { useVisibleChains } from "@/hooks/useVisibleChains";
import { useWalletStates } from "@/states/wallet";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ChainSelect from "@/components/chain/ChainSelect";
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

export interface FocatOrderSummary {
  id: string;
  chainId: ChainId;
  focatAmount: number;
  status: string;
  txHash: string | null;
}

interface FocatPackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lock the sale to one chain (upload flow); omit for a chain picker (dashboard). */
  chainId?: ChainId;
  /** Called after a successful order (refresh balances / server tables). */
  onPurchased?: (order: FocatOrderSummary) => void;
}

/**
 * FocatPackModal — the one purchase surface for FOCAT, shared by the upload
 * flow (chain locked to the active chain) and the dashboard (chain picker).
 * Sells fixed-price bundles ("enough to propose on this chain"), paid from
 * account credits and delivered to a wallet on that chain; testnet chains
 * never sell and drip from a free faucet instead. Verification-fee framing
 * throughout — this is not a trading desk.
 */
export const FocatPackModal = ({ open, onOpenChange, chainId, onPurchased }: FocatPackModalProps) => {
  const { status: sessionStatus } = useSession();
  const authed = sessionStatus === "authenticated";
  const visibleChains = useVisibleChains();
  const selectedAccount = useWalletStates((state) => state.selectedAccount);
  const { toast } = useToast();

  const protocolChains = React.useMemo(
    () => visibleChains.filter(isProtocolChain),
    [visibleChains],
  );
  const [pickedChainId, setPickedChainId] = React.useState<ChainId | null>(null);
  const effectiveChainId = chainId ?? pickedChainId ?? protocolChains[0]?.id;
  const chain = effectiveChainId ? getChain(effectiveChainId) : undefined;

  const [packId, setPackId] = React.useState<FocatPackId>("anchor-pack");
  const [customFocat, setCustomFocat] = React.useState("");
  const [walletAddress, setWalletAddress] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastOrder, setLastOrder] = React.useState<FocatOrderSummary | null>(null);

  // Prefill the recipient with the connected wallet, but leave it editable —
  // dashboard users may top up a different wallet than the one connected.
  React.useEffect(() => {
    if (open && !walletAddress && selectedAccount) {
      setWalletAddress(selectedAccount.address);
    }
  }, [open, walletAddress, selectedAccount]);

  const escrowFocat = ANCHOR_ESCROW.tipFocat + ANCHOR_ESCROW.bondFocat;
  const effectiveAmount =
    packId === "custom"
      ? Number(customFocat) || 0
      : (FOCAT_PACKS.find((pack) => pack.id === packId)?.focatAmount ?? 0);
  const priceUsd = packPriceUsd(effectiveAmount);

  const handleOrder = async () => {
    if (!chain) return;
    if (!walletAddress) {
      setError("Enter the wallet address that will anchor on this chain.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/focat/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: chain.id,
          packId,
          walletAddress,
          customFocat: packId === "custom" ? Number(customFocat) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Order failed");
      const order = data.order as FocatOrderSummary;
      setLastOrder(order);
      onPurchased?.(order);
      toast({
        title: chain.testnet ? "Test FOCAT sent" : "Anchor pack sent",
        description: `${formatFocat(order.focatAmount)} on ${chain.name}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy(false);
    }
  };

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setLastOrder(null);
      setError(null);
    }
  };

  if (!chain) return null;

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title={chain.testnet ? `Test FOCAT on ${chain.name}` : `FOCAT on ${chain.name}`}
      description={
        chain.testnet
          ? "Free faucet drip for QA — testnets never sell packs."
          : "A verification-fee top-up, not a token sale: enough FOCAT to propose on this chain, delivered to a wallet you choose."
      }
      size="md"
    >
      {!authed ? (
        <p className="text-sm text-muted">
          <Link href="/login?next=/dashboard/focat" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to get FOCAT — packs are paid from your account credits. Prefer staying wallet-only?
          Acquire FOCAT externally and anchor as usual.
        </p>
      ) : lastOrder ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            {formatFocat(lastOrder.focatAmount)} sent to{" "}
            <span className="break-all font-mono text-xs">{walletAddress}</span> on {chain.name}.
          </p>
          {lastOrder.txHash && (
            <p className="break-all font-mono text-xs text-muted">tx {lastOrder.txHash}</p>
          )}
          <p className="text-xs text-muted">
            Enough for {Math.floor(lastOrder.focatAmount / escrowFocat) || 1} verified anchor(s) —
            the bond portion comes back after each verification.
          </p>
          <Button onClick={() => close(false)}>Done</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {!chainId && (
            <ChainSelect
              chains={protocolChains}
              value={chain.id}
              onValueChange={(next) => setPickedChainId(next)}
              variant="field"
            />
          )}

          {chain.testnet ? (
            <p className="text-sm text-muted">
              Drips {formatFocat(110)} to the wallet below — enough for one propose (tip + bond +
              buffer).
            </p>
          ) : (
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
          )}

          <div>
            <Input
              value={walletAddress}
              onChange={(event) => setWalletAddress(event.target.value)}
              placeholder={`Recipient wallet on ${chain.name}`}
              aria-label="Recipient wallet address"
            />
            <p className="mt-1 text-xs text-muted">
              FOCAT is chain-specific until bridged.{" "}
              {!chain.testnet && (
                <>
                  Paid from your USD credits at a fixed rate — validators can skip buying entirely
                  and earn FOCAT from verification tips instead.
                </>
              )}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <Button
            onClick={() => void handleOrder()}
            isLoading={busy}
            disabled={(!chain.testnet && effectiveAmount <= 0) || !walletAddress}
          >
            {chain.testnet ? "Request drip" : `Pay $${priceUsd.toFixed(2)} with credits`}
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default FocatPackModal;
