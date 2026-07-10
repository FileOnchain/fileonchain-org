"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_CHAIN_ID, getChain, ZERO_ADDRESS, type ChainId } from "@fileonchain/sdk";
import { useFormDraft } from "@/hooks/useFormDraft";
import { useVisibleChains } from "@/hooks/useVisibleChains";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ChainSelect from "@/components/chain/ChainSelect";
import { CopyButton } from "@/components/ui/CopyButton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { trackEvent } from "@/lib/analytics";

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PendingDeposit {
  id: string;
  chainId: string;
  depositAddress: string;
  amountUsdc: number;
}

/** Mirrors the CachePayments.sol tiers — familiar denominations. */
const PRESETS = [1, 5, 50] as const;

/**
 * Two-step USDC deposit: create a pending intent (shows the deposit
 * address), then confirm. Confirmation is a visible mock seam — the real
 * flow will watch for the onchain USDC transfer instead of a button click.
 */
export const DepositModal = ({ open, onOpenChange }: DepositModalProps) => {
  const router = useRouter();
  const { toast } = useToast();
  const visibleChains = useVisibleChains();

  const [chainId, setChainId] = React.useState<ChainId>(DEFAULT_CHAIN_ID);
  const [amount, setAmount] = React.useState<number>(5);
  const [custom, setCustom] = React.useState("");
  const [pending, setPending] = React.useState<PendingDeposit | null>(null);
  const [txHash, setTxHash] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const effectiveAmount = custom ? Number(custom) : amount;

  // Chains with a recorded USDC token verify the transfer on-chain — the
  // confirm call then needs the transfer's tx hash.
  const pendingChain = pending ? getChain(pending.chainId) : undefined;
  const verified =
    !!pendingChain &&
    pendingChain.family === "evm" &&
    !!pendingChain.usdcContract &&
    pendingChain.usdcContract !== ZERO_ADDRESS;
  const txHashValid = /^0x[0-9a-fA-F]{64}$/.test(txHash.trim());

  // Keeps the picked chain/amount across a page refresh while the modal is
  // open (the pending step is server state and recreates cleanly).
  const { clearDraft } = useFormDraft(
    "credit-deposit",
    { chainId, amount, custom },
    {
      enabled: open,
      restore: (draft) => {
        setChainId(draft.chainId);
        setAmount(draft.amount);
        setCustom(draft.custom);
      },
    },
  );

  const reset = () => {
    setPending(null);
    setBusy(false);
    setError(null);
    setCustom("");
    setTxHash("");
    clearDraft();
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/credits/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, amountUsdc: effectiveAmount }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not create the deposit");
      }
      const data = await res.json();
      setPending({
        id: data.id,
        chainId: data.chainId,
        depositAddress: data.depositAddress,
        amountUsdc: effectiveAmount,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/credits/deposit/${pending.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verified ? { txHash: txHash.trim() } : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not confirm the deposit");
      }
      trackEvent("credit_deposit", {
        chain_id: pending.chainId,
        amount_usdc: pending.amountUsdc,
      });
      toast({
        title: "Credits added",
        description: `${pending.amountUsdc} USDC credited to your account.`,
        variant: "success",
      });
      onOpenChange(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
      title="Add credits"
      description={
        pending
          ? "Send USDC to the address below, then confirm."
          : "Fund your account with USDC so FileOnChain can anchor uploads for you."
      }
    >
      {pending ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Deposit address · {pending.chainId}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="break-all font-mono text-sm text-foreground">
                {pending.depositAddress}
              </span>
              <CopyButton value={pending.depositAddress} ariaLabel="Copy deposit address" />
            </div>
            <p className="mt-2 text-xs text-muted">
              Amount: <span className="font-mono">{pending.amountUsdc} USDC</span>
            </p>
          </div>
          {verified ? (
            <>
              <Input
                label="Transfer tx hash"
                placeholder="0x…"
                value={txHash}
                onChange={(event) => setTxHash(event.target.value)}
                fullWidth
              />
              <p className="text-xs text-muted">
                The transaction is verified on-chain: it must carry a USDC
                transfer to the deposit address covering the amount.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted">
              Demo mode: no transfer is checked yet — confirming credits your
              account immediately. The production flow watches for the onchain
              USDC transfer.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            fullWidth
            isLoading={busy}
            disabled={verified && !txHashValid}
            onClick={() => void handleConfirm()}
          >
            I&apos;ve sent it — confirm deposit
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="deposit-chain"
              className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted"
            >
              Chain
            </label>
            <ChainSelect
              id="deposit-chain"
              chains={visibleChains}
              value={chainId}
              onValueChange={setChainId}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
              Amount
            </p>
            <div className="flex gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setAmount(preset);
                    setCustom("");
                  }}
                  className={cn(
                    "h-10 flex-1 rounded-md border text-sm font-medium transition-colors",
                    !custom && amount === preset
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface text-foreground hover:bg-surface-elevated",
                  )}
                >
                  {preset} USDC
                </button>
              ))}
            </div>
            <Input
              className="mt-2"
              type="number"
              min={0}
              step="0.01"
              placeholder="Custom amount"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              aria-label="Custom USDC amount"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            fullWidth
            isLoading={busy}
            disabled={!Number.isFinite(effectiveAmount) || effectiveAmount <= 0}
            onClick={() => void handleCreate()}
          >
            Continue
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default DepositModal;
