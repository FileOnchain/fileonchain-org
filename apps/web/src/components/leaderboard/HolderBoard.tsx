"use client";

import * as React from "react";
import { Identicon } from "@/components/ui/Identicon";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import BoardRow from "@/components/leaderboard/BoardRow";
import type { MockFocatHolder } from "@/lib/mock/protocol";
import { truncateAddress } from "@/lib/cid/format";

interface HolderBoardProps {
  holders: MockFocatHolder[];
  /** Sum of balance + stake across the board, for the supply-share column. */
  totalTracked: number;
}

const GRID =
  "md:grid-cols-[56px_minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)_60px]";

const TAG_VARIANT: Record<MockFocatHolder["tag"], BadgeVariant> = {
  treasury: "accent",
  platform: "warning",
  validator: "success",
  community: "outline",
};

/**
 * HolderBoard — who holds FOCAT: the protocol treasury, platform treasuries,
 * validators (liquid rewards + locked stake), and community delegates.
 * Holdings count balance plus stake; voting power is ERC20Votes delegation,
 * so it diverges from holdings when tokens are delegated away.
 */
const HolderBoard = ({ holders, totalTracked }: HolderBoardProps) => {
  if (holders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
        No FOCAT holders indexed yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div
        className={`hidden border-b border-border bg-surface-elevated px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid md:gap-4 ${GRID}`}
      >
        <span>Rank</span>
        <span>Holder</span>
        <span>Balance</span>
        <span>Staked</span>
        <span>Voting power</span>
        <span>Share</span>
        <span className="text-right">Open</span>
      </div>
      <ul role="list" className="divide-y divide-border">
        {holders.map((holder, i) => {
          const holdings = holder.balance + holder.staked;
          const share = totalTracked > 0 ? (holdings / totalTracked) * 100 : 0;
          return (
            <BoardRow
              key={holder.address}
              index={i}
              rank={i + 1}
              href={`/profile/${holder.address}`}
              gridClassName={GRID}
            >
              {/* Holder */}
              <div className="flex min-w-0 items-center gap-3">
                <Identicon value={holder.label ?? holder.address} size={36} />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate font-semibold text-foreground">
                      {holder.label ?? truncateAddress(holder.address)}
                    </p>
                    <Badge variant={TAG_VARIANT[holder.tag]} size="sm">
                      {holder.tag}
                    </Badge>
                  </div>
                  <p
                    className="truncate font-mono text-[11px] text-muted"
                    title={holder.address}
                  >
                    {truncateAddress(holder.address, 8)}
                  </p>
                </div>
              </div>

              {/* Balance */}
              <div className="hidden text-sm md:block">
                <span className="font-mono tabular-nums text-foreground">
                  {holder.balance.toLocaleString()}
                </span>
                <span className="ml-1 text-xs text-muted">FOCAT</span>
              </div>

              {/* Staked */}
              <span
                className={
                  holder.staked > 0
                    ? "hidden font-mono text-sm tabular-nums text-foreground md:block"
                    : "hidden font-mono text-sm tabular-nums text-muted md:block"
                }
              >
                {holder.staked.toLocaleString()}
              </span>

              {/* Voting power */}
              <span
                className={
                  holder.votingPower > 0
                    ? "hidden font-mono text-sm tabular-nums text-foreground md:block"
                    : "hidden font-mono text-sm tabular-nums text-muted md:block"
                }
              >
                {holder.votingPower > 0 ? holder.votingPower.toLocaleString() : "—"}
              </span>

              {/* Share of tracked supply */}
              <span className="hidden font-mono text-sm tabular-nums text-foreground md:block">
                {share.toFixed(1)}%
              </span>

              {/* Mobile stat line */}
              <div className="col-span-2 mt-1 flex items-center gap-2 font-mono text-[11px] text-muted md:hidden">
                <span>{holdings.toLocaleString()} FOCAT</span>
                <span>·</span>
                <span>{share.toFixed(1)}% share</span>
                <span>·</span>
                <span>{holder.votingPower.toLocaleString()} votes</span>
              </div>
            </BoardRow>
          );
        })}
      </ul>
    </div>
  );
};

export default HolderBoard;
