"use client";

import * as React from "react";
import { FiCheck } from "react-icons/fi";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CACHE_PRICING } from "@/lib/mock/cache";

interface CachePricingTableProps {
  onChoose?: (tier: "SingleFile" | "Folder" | "Permanent") => void;
}

/**
 * CachePricingTable — three-tier pricing grid. "Choose" button is wired to
 * `onChoose` which kicks off the mock payment flow.
 */
export const CachePricingTable = ({ onChoose }: CachePricingTableProps) => {
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
            <span className="text-3xl font-bold text-foreground">${tier.priceUsdc}</span>
            <span className="text-sm text-muted">
              USDC
              {tier.durationDays ? ` / ${tier.durationDays} days` : " permanent"}
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