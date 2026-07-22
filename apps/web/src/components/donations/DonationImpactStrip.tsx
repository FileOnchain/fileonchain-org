"use client";

import * as React from "react";
import { StatCounter } from "@/components/LiveLedgerTicker";
import { useDonationsStates } from "@/states/donations";

/**
 * DonationImpactStrip — ledger-style animated totals derived from the
 * donations feed: amount raised (donation count for now), distinct
 * donors, and funded targets.
 *
 * The donations feed carries **native-token wei** strings from the
 * `Donated` event, not USDC strings as the legacy mock did — the
 * previous version summed `"10 USDC"` and `"5"` as if both were USD,
 * which is wrong as soon as any chain carries real native donations.
 * Until we have a price oracle across chains we report the donation
 * **count** instead of an unsound "raised" total, and stop applying a
 * `USDC` suffix. This keeps the surface honest while we ship the
 * price-oracle follow-up.
 */
export const DonationImpactStrip = () => {
  const feed = useDonationsStates((s) => s.feed);

  const { donations, donors, targets } = React.useMemo(() => {
    const donorSet = new Set<string>();
    const targetSet = new Set<string>();
    for (const d of feed) {
      donorSet.add(d.donor.toLowerCase());
      targetSet.add(`${d.recipientType}:${d.target}`);
    }
    return {
      donations: feed.length,
      donors: donorSet.size,
      targets: targetSet.size,
    };
  }, [feed]);

  return (
    <div className="grid grid-cols-1 gap-6 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-3 sm:gap-8">
      <StatCounter
        value={donations}
        label="Donations"
        hint="Across every chain"
        format={(n) => Math.round(n).toString()}
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
