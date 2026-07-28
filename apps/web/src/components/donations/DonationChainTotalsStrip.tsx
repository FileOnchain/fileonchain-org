import * as React from "react";
import { formatUnits } from "viem";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { ChainBadge } from "@/components/ui/ChainBadge";
import type { ChainDonationTotalsMap } from "@/lib/server/donations";

interface DonationChainTotalsStripProps {
  totals: ChainDonationTotalsMap;
}

/**
 * DonationChainTotalsStrip — one static card per provisioned EVM
 * chain showing the cumulative PerChain donation total in that
 * chain's native token. No cross-chain sum: ETH ≠ tAI3 and the
 * existing `DonationImpactStrip` honesty note (lines 7-19) calls out
 * why we don't attempt a price-oracle rollup here.
 *
 * Server-safe (no "use client") so the totals land in the initial
 * HTML payload; the parent page already fetches the map via
 * `getChainDonationTotals()` server-side and passes it down. RPC
 * failures render "unavailable" — never fabricate a zero.
 */
export const DonationChainTotalsStrip = ({ totals }: DonationChainTotalsStripProps) => {
  const rows = Object.values(totals).filter(
    (row): row is NonNullable<typeof row> => row !== undefined,
  );

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted">
        No provisioned donation chains reporting yet — chain totals will appear here once
        RPCs are reachable.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          // formatUnits is safe on "0" / "1" / any decimal-string wei amount.
          const display = formatUnits(BigInt(row.total), row.nativeDecimals);
          return (
            <Card key={row.chainId} variant="outlined">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{row.chainName}</CardTitle>
                  <ChainBadge
                    chainId={row.chainId as never}
                    chainName={row.chainName}
                    shortName={row.chainShortName}
                    size="sm"
                  />
                </div>
                <CardDescription>Per-chain donations, all-time</CardDescription>
              </CardHeader>
              <p className="text-2xl font-bold text-foreground">
                {display}{" "}
                <span className="text-sm font-medium text-muted">{row.nativeSymbol}</span>
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-muted">
                Native token, not USD
              </p>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        Per-chain totals reflect <code className="font-mono">chainDonationTotal</code> on
        each chain&apos;s deployed <code className="font-mono">DonationEscrow</code>.
        Platform donations are not aggregated on chain — see the
        <code className="font-mono">donation_targets</code> off-chain index follow-up.
      </p>
    </div>
  );
};

export default DonationChainTotalsStrip;