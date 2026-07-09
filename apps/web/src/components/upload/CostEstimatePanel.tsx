"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FiAlertTriangle, FiCheck, FiInfo } from "react-icons/fi";
import {
  formatCostUsd,
  getChainCostEstimates,
  totalCostFor,
  type ChainCostEstimate,
} from "@/lib/mock/costs";
import { isChainActive } from "@fileonchain/sdk";
import { useChain } from "@/hooks/useChain";
import { useVisibleChains } from "@/hooks/useVisibleChains";
import { cn } from "@/lib/cn";

interface CostEstimatePanelProps {
  chunkCount: number;
}

/**
 * CostEstimatePanel — surfaces per-chain costs for anchoring the file so
 * users see that "do this on multiple chains" is not free. The active chain
 * is highlighted; the total cost for *every* selected chain is summed at
 * the bottom.
 *
 * Display-only — actual signing happens in the registry's contract call.
 */

const TIER_STYLES: Record<ChainCostEstimate["tier"], string> = {
  testnet: "border-border bg-surface text-muted",
  cheap: "border-success/30 bg-success/5 text-success",
  moderate: "border-warning/30 bg-warning/5 text-warning",
  expensive: "border-danger/30 bg-danger/5 text-danger",
};

const TIER_LABELS: Record<ChainCostEstimate["tier"], string> = {
  testnet: "Testnet",
  cheap: "Cheap",
  moderate: "Moderate",
  expensive: "Expensive",
};

const CostEstimatePanel = ({ chunkCount }: CostEstimatePanelProps) => {
  const { activeChain } = useChain();
  const visibleChains = useVisibleChains();
  // Same testnet-visibility gate as every picker, narrowed to chains that
  // are open for uploads — planned/deprecated chains can't be anchored on,
  // so offering them as redundancy would be noise. The active chain stays
  // even if it's a testnet the preference would hide (the page-level
  // warning covers a persisted non-active chain).
  const estimates = React.useMemo(() => {
    const anchorable = new Set(
      visibleChains.filter(isChainActive).map((chain) => chain.id),
    );
    return getChainCostEstimates().filter(
      (est) => anchorable.has(est.chainId) || est.chainId === activeChain.id,
    );
  }, [visibleChains, activeChain.id]);
  // Chains the user has selected for redundant anchoring. The active chain
  // is on by default; the user can toggle others.
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set([activeChain.id]),
  );
  // Keep the active chain selected if it changes (e.g. via the nav switcher).
  React.useEffect(() => {
    setSelected((prev) => {
      if (prev.has(activeChain.id)) return prev;
      const next = new Set(prev);
      next.add(activeChain.id);
      return next;
    });
  }, [activeChain.id]);

  const total = React.useMemo(() => {
    let usd = 0;
    let platforms = 0;
    for (const est of estimates) {
      if (!selected.has(est.chainId)) continue;
      const t = totalCostFor(est, chunkCount);
      usd += t.usd;
      platforms += est.platformFeePct;
    }
    return { usd, chains: selected.size, avgPlatformFee: platforms / Math.max(1, selected.size) };
  }, [estimates, selected, chunkCount]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 md:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Anchoring cost
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {chunkCount.toLocaleString()} {chunkCount === 1 ? "chunk" : "chunks"} ·
            {" "}{selected.size} {selected.size === 1 ? "chain" : "chains"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Estimated total
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
            {formatCostUsd(total.usd)}
          </p>
        </div>
      </header>

      <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-muted">
        <FiInfo size={11} className="mt-0.5 shrink-0" />
        One chain is enough to retrieve. Each chain you check below pays its own
        gas and a small platform fee — costs scale linearly with the number of chains.
      </p>

      {/* Chunk anchoring on L1s adds up fast — call it out before signing. */}
      {estimates.some((est) => selected.has(est.chainId) && est.tier === "expensive") && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 rounded-md border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-[11px] text-danger"
        >
          <FiAlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span>
            {estimates
              .filter((est) => selected.has(est.chainId) && est.tier === "expensive")
              .map(
                (est) =>
                  `${est.chainName} fees are high — about ${formatCostUsd(totalCostFor(est, chunkCount).usd)} for this file`,
              )
              .join("; ")}
            . An L2 anchors the same CIDs for a fraction of that.
          </span>
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {estimates.map((est) => {
          const isActive = est.chainId === activeChain.id;
          const isSelected = selected.has(est.chainId);
          const total = totalCostFor(est, chunkCount);
          return (
            <motion.button
              key={est.chainId}
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                // The active chain can never be unchecked, only the redundant ones.
                if (isActive && isSelected && selected.size === 1) return;
                toggle(est.chainId);
              }}
              disabled={isActive && selected.size === 1}
              aria-pressed={isSelected}
              className={cn(
                "group flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-colors duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-surface-elevated hover:border-primary/40",
                (isActive && selected.size === 1) && "cursor-default",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono font-semibold text-foreground">
                    {est.shortName}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                      TIER_STYLES[est.tier],
                    )}
                  >
                    {TIER_LABELS[est.tier]}
                  </span>
                  {isSelected && (
                    <FiCheck size={12} className="ml-auto shrink-0 text-primary" />
                  )}
                </div>
                <p className="mt-0.5 text-[10px] text-muted">
                  {isActive ? "Active chain · required" : `+ ${formatCostUsd(total.usd)} total`}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>

      {selected.size === 0 && (
        <p className="mt-3 text-[11px] text-warning">
          No chains selected — pick at least the active chain to anchor.
        </p>
      )}
    </div>
  );
};

export default CostEstimatePanel;
