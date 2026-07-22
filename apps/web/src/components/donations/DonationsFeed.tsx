"use client";

import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDonationsStates } from "@/states/donations";
import type { MockDonation } from "@/lib/mock/donations";
import { getChain } from "@fileonchain/sdk";
import { truncateCID } from "@/lib/cid/format";
import { FiHeart } from "react-icons/fi";

const RECIPIENT_LABEL = {
  Platform: "Platform",
  PerCID: "Per-CID",
  PerChain: "Per-chain",
} as const;

const formatAgo = (ts: number): string => {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
};

/**
 * DonationsFeed — recent donations feed. Renders memo + donor + amount.
 *
 * On mount we hydrate the Zustand store from `/api/donations/recent`,
 * which reads the `Donated` event stream across every provisioned EVM
 * chain via `lib/server/donations.ts`. Real events are native-token
 * amounts in wei — the contract is `payable` — so we prepend the native
 * symbol from the chain's metadata on render.
 */
export const DonationsFeed = () => {
  const feed = useDonationsStates((s) => s.feed);
  const addDonation = useDonationsStates((s) => s.addDonation);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/donations/recent?limit=20", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { donations?: MockDonation[] };
        if (cancelled || !data.donations) return;
        for (const donation of data.donations) {
          addDonation(donation);
        }
      } catch {
        // Network failure: keep the seeded state.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [addDonation]);

  if (feed.length === 0) {
    return (
      <EmptyState
        icon={<FiHeart size={20} />}
        title="No donations yet"
        description="Be the first to support the public cache layer."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {feed.map((d) => {
        const chain = d.recipientType === "PerChain" ? getChain(d.target as never) : null;
        return (
          <li key={d.id}>
            <Card>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="accent" size="sm">
                    {RECIPIENT_LABEL[d.recipientType]}
                  </Badge>
                  <span className="text-sm font-semibold text-foreground">{d.amount}</span>
                  {chain && (
                    <ChainBadge
                      chainId={chain.id}
                      chainName={chain.name}
                      shortName={chain.shortName}
                      size="sm"
                    />
                  )}
                </div>
                {/* Relative time is derived from Date.now(), which differs between
                    the server render and hydration — suppress the text mismatch. */}
                <span className="text-xs text-muted shrink-0" suppressHydrationWarning>
                  {formatAgo(d.timestamp)}
                </span>
              </div>

              {d.memo && (
                <p className="text-sm text-foreground mb-2 break-words">&ldquo;{d.memo}&rdquo;</p>
              )}

              <div className="flex items-center gap-1 text-xs text-muted">
                <span className="font-mono">{truncateCID(d.txHash)}</span>
                <CopyButton value={d.txHash} ariaLabel="Copy donation tx hash" />
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
};

export default DonationsFeed;