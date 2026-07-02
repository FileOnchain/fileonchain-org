"use client";

import * as React from "react";
import { StatCounter } from "@/components/LiveLedgerTicker";
import { useDonationsStates } from "@/states/donations";

/**
 * DonationImpactStrip — ledger-style animated totals derived from the
 * donations feed: amount raised, distinct donors, and funded targets.
 * Gives the donations page a sense of collective impact above the feed.
 */
export const DonationImpactStrip = () => {
  const feed = useDonationsStates((s) => s.feed);

  const { totalUsdc, donors, targets } = React.useMemo(() => {
    const donorSet = new Set<string>();
    const targetSet = new Set<string>();
    let total = 0;
    for (const d of feed) {
      donorSet.add(d.donor.toLowerCase());
      targetSet.add(`${d.recipientType}:${d.target}`);
      // Mock amounts are human-readable strings like "10 USDC".
      const amount = Number.parseFloat(d.amount);
      if (Number.isFinite(amount)) total += amount;
    }
    return { totalUsdc: total, donors: donorSet.size, targets: targetSet.size };
  }, [feed]);

  return (
    <div className="grid grid-cols-1 gap-6 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-3 sm:gap-8">
      <StatCounter
        value={totalUsdc}
        label="Raised for pinning"
        hint="All recipients, USDC"
        format={(n) => n.toFixed(0)}
        suffix=" USDC"
      />
      <StatCounter
        value={donors}
        label="Donors"
        hint="Distinct addresses"
        format={(n) => Math.round(n).toString()}
      />
      <StatCounter
        value={targets}
        label="Targets funded"
        hint="Platform · CIDs · chains"
        format={(n) => Math.round(n).toString()}
      />
    </div>
  );
};

export default DonationImpactStrip;
