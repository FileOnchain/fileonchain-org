"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { FiCreditCard, FiEdit3, FiShield } from "react-icons/fi";
import { useChain } from "@/hooks/useChain";
import { getChainCostEstimates, totalCostFor, formatCostUsd } from "@/lib/mock/costs";
import { formatMicroUsdc } from "@/lib/usdc";
import { getByokProvider } from "@/lib/byok/providers";
import type { UploadPaymentMethod } from "@/hooks/useFileUploader";
import { cn } from "@/lib/cn";

interface ByokKeyOption {
  id: string;
  provider: string;
  label: string;
  status: string;
}

interface PaymentMethodSelectorProps {
  value: UploadPaymentMethod;
  byokKeyId: string | null;
  chunkCount: number;
  onChange: (method: UploadPaymentMethod) => void;
  onByokKeyChange: (id: string | null) => void;
}

/**
 * PaymentMethodSelector — choose how an anchor is paid for:
 *
 * - Pay as you go: the connected wallet signs; in production one transaction
 *   per chunk.
 * - Credits: the signed-in account pays in USDC credits and the backend
 *   anchors server-side (no per-chunk signing).
 * - BYOK: route through the user's own provider key when one is valid for
 *   the active chain.
 */
export const PaymentMethodSelector = ({
  value,
  byokKeyId,
  chunkCount,
  onChange,
  onByokKeyChange,
}: PaymentMethodSelectorProps) => {
  const { status: sessionStatus } = useSession();
  const authed = sessionStatus === "authenticated";
  const { activeChain } = useChain();

  const [balance, setBalance] = React.useState<bigint | null>(null);
  const [byokKeys, setByokKeys] = React.useState<ByokKeyOption[]>([]);

  const costUsd = React.useMemo(() => {
    const estimate = getChainCostEstimates().find(
      (e) => e.chainId === activeChain.id,
    );
    return estimate ? totalCostFor(estimate, chunkCount).usd : 0;
  }, [activeChain.id, chunkCount]);

  React.useEffect(() => {
    if (!authed) {
      setBalance(null);
      setByokKeys([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [creditsRes, byokRes] = await Promise.all([
          fetch("/api/credits"),
          fetch("/api/byok"),
        ]);
        if (cancelled) return;
        if (creditsRes.ok) {
          const data = await creditsRes.json();
          setBalance(BigInt(data.balanceMicroUsdc));
        }
        if (byokRes.ok) {
          const data = await byokRes.json();
          setByokKeys(
            (data.keys as ByokKeyOption[]).filter((key) => {
              const provider = getByokProvider(key.provider);
              return (
                key.status === "valid" &&
                provider?.chainIds.includes(activeChain.id)
              );
            }),
          );
        }
      } catch {
        // Selector stays usable with pay-as-you-go if account reads fail.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, activeChain.id]);

  // Deselect account-bound methods when they become unavailable.
  React.useEffect(() => {
    if (!authed && value !== "payg") onChange("payg");
    if (value === "byok" && byokKeys.length === 0) onChange("payg");
  }, [authed, byokKeys.length, value, onChange]);

  React.useEffect(() => {
    if (value === "byok" && !byokKeyId && byokKeys[0]) {
      onByokKeyChange(byokKeys[0].id);
    }
  }, [value, byokKeyId, byokKeys, onByokKeyChange]);

  const insufficient =
    balance !== null && Number(balance) / 1_000_000 < costUsd;

  const optionClass = (selected: boolean, disabled: boolean) =>
    cn(
      "w-full rounded-lg border p-3 text-left transition-colors",
      selected
        ? "border-primary bg-primary/5"
        : "border-border bg-surface hover:bg-surface-elevated",
      disabled && "cursor-not-allowed opacity-60 hover:bg-surface",
    );

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
        Payment method
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          className={optionClass(value === "payg", false)}
          onClick={() => onChange("payg")}
          aria-pressed={value === "payg"}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FiEdit3 aria-hidden /> Pay as you go
          </span>
          <span className="mt-1 block text-xs text-muted">
            Sign with your connected wallet — one transaction per chunk
            ({chunkCount}). Est. {formatCostUsd(costUsd)} in gas.
          </span>
        </button>

        <button
          type="button"
          className={optionClass(value === "credits", !authed)}
          onClick={() => authed && onChange("credits")}
          aria-pressed={value === "credits"}
          disabled={!authed}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FiCreditCard aria-hidden /> Use credits
          </span>
          <span className="mt-1 block text-xs text-muted">
            {authed ? (
              <>
                FileOnChain anchors for you — no signatures. Cost{" "}
                {formatCostUsd(costUsd)}
                {balance !== null && <> · balance {formatMicroUsdc(balance)}</>}
                {insufficient && (
                  <>
                    {" · "}
                    <Link
                      href="/dashboard/credits"
                      className="text-primary hover:underline"
                    >
                      top up
                    </Link>
                  </>
                )}
              </>
            ) : (
              <>
                <Link href="/login?next=/" className="text-primary hover:underline">
                  Sign in
                </Link>{" "}
                to fund an account and skip per-chunk signing.
              </>
            )}
          </span>
        </button>

        {authed && byokKeys.length > 0 && (
          <button
            type="button"
            className={cn(optionClass(value === "byok", false), "sm:col-span-2")}
            onClick={() => onChange("byok")}
            aria-pressed={value === "byok"}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FiShield aria-hidden /> Use your own provider key
            </span>
            <span className="mt-1 block text-xs text-muted">
              Route this upload through{" "}
              {getByokProvider(byokKeys[0].provider)?.name ?? byokKeys[0].provider}{" "}
              using your existing credit there — no FileOnChain credits spent.
            </span>
            {value === "byok" && byokKeys.length > 1 && (
              <select
                value={byokKeyId ?? byokKeys[0].id}
                onChange={(event) => onByokKeyChange(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                className="mt-2 h-9 w-full rounded-md border border-border bg-surface px-2 text-xs text-foreground"
                aria-label="Provider key"
              >
                {byokKeys.map((key) => (
                  <option key={key.id} value={key.id}>
                    {key.label}
                  </option>
                ))}
              </select>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default PaymentMethodSelector;
