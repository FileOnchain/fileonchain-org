"use client";

import * as React from "react";
import { FiCheck } from "react-icons/fi";
import { formatUnits } from "viem";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CACHE_PRICING, type CacheTier, type CacheTierPricing } from "@/lib/mock/cache";
import { useChain } from "@/hooks/useChain";

interface CachePricingTableProps {
  onChoose?: (tier: CacheTier) => void;
}

interface LivePricingRow {
  single: string;
  folder: string;
  permanent: string;
  treasury: `0x${string}`;
}

type LivePricingMap = Partial<Record<string, LivePricingRow>>;

const TIER_TO_PRICE_KEY: Record<CacheTier, keyof Pick<LivePricingRow, "single" | "folder" | "permanent">> = {
  SingleFile: "single",
  Folder: "folder",
  Permanent: "permanent",
};

/** Format a USDC 6-decimal wei string as a marketing-style number. Two
 *  decimals max — cache pricing never needs more granularity. */
const formatUsdcWei = (wei: string): string => {
  const formatted = formatUnits(BigInt(wei), 6);
  // Drop trailing zeros after the decimal point so "$1" stays "$1".
  const [whole, frac = ""] = formatted.split(".");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
};

/**
 * CachePricingTable — three-tier pricing grid. On mount we hydrate from
 * `/api/cache/pricing` so provisioned chains (Sepolia, Auto EVM Chronos)
 * show live USDC from `CachePayments.priceSingle/priceFolder/pricePermanent`.
 * Unprovisioned chains and fetch failures fall back to the marketing
 * `CACHE_PRICING` table so the page stays explorable.
 *
 * Initialization renders the marketing values so there's no flash on
 * first paint; successful hydration replaces them in place without
 * changing the component key, so the user sees no layout shift.
 */
export const CachePricingTable = ({ onChoose }: CachePricingTableProps) => {
  const { activeChain } = useChain();
  const [live, setLive] = React.useState<LivePricingMap | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/cache/pricing", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { pricing?: LivePricingMap };
        if (cancelled) return;
        setLive(data.pricing ?? {});
      } catch {
        // Network failure — keep marketing fallback.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const liveRow = live?.[activeChain.id];

  const renderPrice = (tier: CacheTierPricing): string => {
    const key = TIER_TO_PRICE_KEY[tier.tier];
    if (liveRow) {
      const wei = liveRow[key];
      if (wei !== undefined) return formatUsdcWei(wei);
    }
    return String(tier.priceUsdc);
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {CACHE_PRICING.map((tier) => (
        <Card key={tier.tier} variant={tier.tier === "Permanent" ? "elevated" : "default"}>
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-semibold text-foreground">{tier.label}</h3>
            {tier.tier === "Permanent" && (
              <Badge variant="accent" size="sm">
                Best value
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted mb-4">{tier.description}</p>

          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-3xl font-bold text-foreground">${renderPrice(tier)}</span>
            <span className="text-sm text-muted">
              USDC
              {tier.durationDays ? ` / ${tier.durationDays} days` : " permanent"}
              {liveRow && (
                <span className="ml-1 text-[10px] uppercase tracking-wider text-success">
                  live
                </span>
              )}
            </span>
          </div>

          <ul className="mb-5 space-y-2 text-sm">
            {tier.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-muted">
                <FiCheck size={14} className="mt-1 text-success shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <Button
            fullWidth
            variant={tier.tier === "Permanent" ? "primary" : "secondary"}
            onClick={() => onChoose?.(tier.tier)}
          >
            Choose {tier.label.toLowerCase()}
          </Button>
        </Card>
      ))}
    </div>
  );
};

export default CachePricingTable;