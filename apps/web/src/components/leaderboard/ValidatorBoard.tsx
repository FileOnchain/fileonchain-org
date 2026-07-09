"use client";

import * as React from "react";
import { Identicon } from "@/components/ui/Identicon";
import { Badge } from "@/components/ui/Badge";
import BoardRow from "@/components/leaderboard/BoardRow";
import type { MockValidator } from "@/lib/mock/protocol";
import { truncateAddress } from "@/lib/cid/format";

interface ValidatorBoardProps {
  validators: MockValidator[];
}

const GRID =
  "md:grid-cols-[56px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_60px]";

/**
 * ValidatorBoard — the verification market's supply side, ranked. Stake buys
 * a seat in the active set; rewards are the 60% tip share plus won bonds;
 * slashes are jury votes on the losing side. Rows link to the validator's
 * public profile.
 */
const ValidatorBoard = ({ validators }: ValidatorBoardProps) => {
  if (validators.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
        No validators staked yet — stake FOCAT to join the active set.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div
        className={`hidden border-b border-border bg-surface-elevated px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid md:gap-4 ${GRID}`}
      >
        <span>Rank</span>
        <span>Validator</span>
        <span>Stake</span>
        <span>Rewards</span>
        <span>Jury duties</span>
        <span>Slashes</span>
        <span>Status</span>
        <span className="text-right">Open</span>
      </div>
      <ul role="list" className="divide-y divide-border">
        {validators.map((validator, i) => (
          <BoardRow
            key={validator.address}
            index={i}
            rank={i + 1}
            href={`/profile/${validator.address}`}
            gridClassName={GRID}
          >
            {/* Validator */}
            <div className="flex min-w-0 items-center gap-3">
              <Identicon value={validator.address} size={36} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {truncateAddress(validator.address)}
                </p>
                <p
                  className="truncate font-mono text-[11px] text-muted"
                  title={validator.address}
                >
                  {truncateAddress(validator.address, 8)}
                </p>
              </div>
            </div>

            {/* Stake */}
            <div className="hidden text-sm md:block">
              <span className="font-mono tabular-nums text-foreground">
                {validator.stake.toLocaleString()}
              </span>
              <span className="ml-1 text-xs text-muted">FOCAT</span>
            </div>

            {/* Rewards */}
            <div className="hidden text-sm md:block">
              <span className="font-mono tabular-nums text-foreground">
                {validator.rewardsEarned.toLocaleString()}
              </span>
              <span className="ml-1 text-xs text-muted">FOCAT</span>
            </div>

            {/* Jury duties */}
            <span className="hidden font-mono text-sm tabular-nums text-foreground md:block">
              {validator.juryDuties}
            </span>

            {/* Slashes */}
            <span
              className={
                validator.slashes > 0
                  ? "hidden font-mono text-sm tabular-nums text-danger md:block"
                  : "hidden font-mono text-sm tabular-nums text-muted md:block"
              }
            >
              {validator.slashes}
            </span>

            {/* Status */}
            <span className="hidden md:block">
              <Badge variant={validator.active ? "success" : "warning"} size="sm">
                {validator.active ? "active" : "below min"}
              </Badge>
            </span>

            {/* Mobile stat line */}
            <div className="col-span-2 mt-1 flex items-center gap-2 font-mono text-[11px] text-muted md:hidden">
              <span>{validator.stake.toLocaleString()} staked</span>
              <span>·</span>
              <span>{validator.rewardsEarned.toLocaleString()} earned</span>
              <span>·</span>
              <span>{validator.juryDuties} juries</span>
            </div>
          </BoardRow>
        ))}
      </ul>
    </div>
  );
};

export default ValidatorBoard;
