"use client";

import * as React from "react";
import Link from "next/link";
import {
  FiAlertTriangle,
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiZap,
} from "react-icons/fi";
import { getChain, type ChainId } from "@fileonchain/sdk";
import {
  useUploadRecommendation,
  type AdvisorView,
} from "@/hooks/useUploadRecommendation";
import { formatCostUsd } from "@/lib/mock/costs";
import { formatBytes } from "@/lib/cid/format";
import { trackEvent } from "@/lib/analytics";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import type {
  RecommendationFactor,
  UploadIntent,
} from "@/lib/recommendations/types";
import type { UploadPaymentMethod } from "@/hooks/useFileUploader";

/**
 * UploadAdvisor — one actionable chain + payment recommendation shown right
 * after a file is selected, with Accept applying the suggested settings and
 * "Change anyway" leaving the user in full control of the selectors below.
 * Hidden entirely when the NEXT_PUBLIC_UPLOAD_ADVISOR_ENABLED flag is "0"
 * or the user turned the advisor off in Preferences.
 */

export interface AdvisorApplyPayload {
  chainId: ChainId;
  paymentMethod: UploadPaymentMethod;
  byokKeyId?: string;
}

interface UploadAdvisorProps {
  file: File | null;
  chunkCount: number;
  onApply: (payload: AdvisorApplyPayload) => void;
}

const PAYMENT_LABELS: Record<UploadPaymentMethod, string> = {
  payg: "Pay as you go",
  credits: "Credits",
  byok: "Your provider key",
};

const INTENT_OPTIONS: Array<{ value: UploadIntent; label: string }> = [
  { value: "testnet", label: "Testing" },
  { value: "production", label: "Production permanence" },
  { value: "lowest_cost", label: "Lowest cost" },
];

const describeFactor = (factor: RecommendationFactor): string => {
  switch (factor.type) {
    case "file":
      return `${formatBytes(factor.sizeBytes)} · ${factor.mimeType || "unknown type"} · ${factor.chunkCount.toLocaleString()} ${factor.chunkCount === 1 ? "chunk" : "chunks"}`;
    case "wallet":
      return factor.connected
        ? `${factor.family} wallet connected`
        : `No ${factor.family} wallet connected`;
    case "credits":
      return `Credit balance $${factor.balanceUsd.toFixed(2)} · needs ${formatCostUsd(factor.requiredUsd)} (${factor.sufficient ? "covered" : "not covered"})`;
    case "byok":
      return `Provider key available (${factor.providerId})`;
    case "cost": {
      const chain = getChain(factor.chainId);
      return `~${formatCostUsd(factor.usd)} on ${chain?.name ?? factor.chainId} (${factor.tier} tier)`;
    }
    case "provisioning":
      return factor.provisioned
        ? "Registry deployed — anchors land on-chain"
        : "Nothing deployed yet — anchor is simulated";
    case "intent":
      return `Intent: ${factor.label}`;
  }
};

export const UploadAdvisor = ({
  file,
  chunkCount,
  onApply,
}: UploadAdvisorProps) => {
  const {
    enabled,
    status,
    recommendation,
    source,
    intent,
    setIntent,
    view,
    setView,
  } = useUploadRecommendation({ file, chunkCount });
  const [expanded, setExpanded] = React.useState(false);

  // Fire recommendation_shown once per rendered suggestion.
  const shownKey = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!recommendation || status !== "ready" || view !== "suggestion") return;
    const key = `${recommendation.suggested.chainId}:${recommendation.suggested.paymentMethod}:${recommendation.headline}`;
    if (shownKey.current === key) return;
    shownKey.current = key;
    trackEvent("recommendation_shown", {
      chain_id: recommendation.suggested.chainId,
      payment_method: recommendation.suggested.paymentMethod,
      confidence: recommendation.confidence,
      chunk_count: Math.max(1, chunkCount),
      file_size: file?.size ?? 0,
      source,
    });
  }, [recommendation, status, view, chunkCount, file, source]);

  if (!enabled || !file || status === "idle") return null;

  const setViewAndCollapse = (next: AdvisorView) => {
    setView(next);
    setExpanded(false);
  };

  const accept = () => {
    if (!recommendation) return;
    onApply({
      chainId: recommendation.suggested.chainId,
      paymentMethod: recommendation.suggested.paymentMethod,
      byokKeyId: recommendation.suggested.byokKeyId,
    });
    setViewAndCollapse("accepted");
    trackEvent("recommendation_accepted", {
      chain_id: recommendation.suggested.chainId,
      payment_method: recommendation.suggested.paymentMethod,
      chunk_count: Math.max(1, chunkCount),
    });
  };

  const dismiss = () => {
    setViewAndCollapse("dismissed");
    if (recommendation) {
      trackEvent("recommendation_dismissed", {
        chain_id: recommendation.suggested.chainId,
        payment_method: recommendation.suggested.paymentMethod,
      });
    }
  };

  const changeIntent = (next: UploadIntent) => {
    const resolved = intent === next ? "balanced" : next;
    setIntent(resolved);
    trackEvent("recommendation_intent_changed", { intent: resolved });
  };

  if (status === "loading" && !recommendation) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
          <FiZap aria-hidden /> Upload advisor
        </p>
        <Skeleton height={18} width="70%" />
        <p className="mt-2 text-xs text-muted">Calculating best option…</p>
      </div>
    );
  }

  if (!recommendation) return null;

  const suggestedChain = getChain(recommendation.suggested.chainId);
  const blocked = recommendation.blockers.length > 0;

  if (view === "accepted") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm text-foreground">
          <FiCheck aria-hidden className="text-success" />
          Using: {suggestedChain?.shortName ?? recommendation.suggested.chainId} ·{" "}
          {PAYMENT_LABELS[recommendation.suggested.paymentMethod]} ·{" "}
          {formatCostUsd(recommendation.estimatedCostUsd)}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setView("suggestion")}>
          Edit
        </Button>
      </div>
    );
  }

  if (view === "dismissed") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-2.5">
        <span className="text-xs text-muted">Advisor dismissed for this file.</span>
        <Button variant="ghost" size="sm" onClick={() => setView("suggestion")}>
          Show suggestion
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface p-4",
        blocked
          ? "border-danger/40"
          : recommendation.confidence === "low"
            ? "border-dashed border-border"
            : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
          <FiZap aria-hidden className="text-primary" /> Upload advisor
        </p>
        {recommendation.confidence === "low" && (
          <Badge variant="outline" size="sm">
            Suggestion only
          </Badge>
        )}
        {source === "fallback" && (
          <Badge variant="info" size="sm">
            Offline estimate
          </Badge>
        )}
      </div>

      <p aria-live="polite" className="mt-2 text-sm font-medium text-foreground">
        {recommendation.headline}
      </p>
      {recommendation.rationale && (
        <p className="mt-1 text-xs text-muted">{recommendation.rationale}</p>
      )}

      {recommendation.warnings.map((warning) => (
        <p
          key={warning}
          className="mt-2 flex items-start gap-1.5 text-[11px] text-warning"
        >
          <FiAlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden />
          {warning}
        </p>
      ))}
      {recommendation.blockers.map((blocker) => (
        <p
          key={blocker.code}
          role="alert"
          className="mt-2 flex items-start gap-1.5 rounded-md border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-[11px] text-danger"
        >
          <FiAlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {blocker.message}
            {blocker.href && (
              <>
                {" "}
                <Link href={blocker.href} className="text-primary hover:underline">
                  Top up credits
                </Link>
              </>
            )}
          </span>
        </p>
      ))}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button size="sm" onClick={accept} disabled={blocked}>
          Accept
        </Button>
        <Button variant="secondary" size="sm" onClick={dismiss}>
          Change anyway
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((prev) => !prev)}
          rightIcon={expanded ? <FiChevronUp aria-hidden /> : <FiChevronDown aria-hidden />}
          aria-expanded={expanded}
        >
          Why?
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-medium uppercase tracking-wider">Suggested</span>
            {suggestedChain && (
              <ChainBadge
                chainId={suggestedChain.id}
                chainName={suggestedChain.name}
                shortName={suggestedChain.shortName}
                size="sm"
              />
            )}
            <span>· {PAYMENT_LABELS[recommendation.suggested.paymentMethod]}</span>
            <span>· est. {formatCostUsd(recommendation.estimatedCostUsd)}</span>
          </div>

          <ul className="space-y-1 text-xs text-muted">
            {recommendation.factors.map((factor, index) => (
              <li key={`${factor.type}-${index}`} className="flex items-start gap-1.5">
                <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-border" />
                {describeFactor(factor)}
              </li>
            ))}
          </ul>

          {recommendation.suggested.secondaryChainIds.length > 0 && (
            <p className="text-xs text-muted">
              Optional redundancy: also consider anchoring on{" "}
              {recommendation.suggested.secondaryChainIds
                .map((chainId) => getChain(chainId)?.shortName ?? chainId)
                .join(", ")}{" "}
              — pick them in the cost panel below.
            </p>
          )}

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              I&apos;m optimizing for
            </p>
            <div className="flex flex-wrap gap-1.5">
              {INTENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => changeIntent(option.value)}
                  aria-pressed={intent === option.value}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    intent === option.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface-elevated text-muted hover:border-primary/40",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadAdvisor;
