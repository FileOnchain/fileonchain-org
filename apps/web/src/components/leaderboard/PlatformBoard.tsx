"use client";

import * as React from "react";
import { Identicon } from "@/components/ui/Identicon";
import { Badge } from "@/components/ui/Badge";
import BoardRow from "@/components/leaderboard/BoardRow";
import type { MockPlatform } from "@/lib/mock/protocol";
import { truncateAddress } from "@/lib/cid/format";

interface PlatformBoardProps {
  platforms: MockPlatform[];
}

const GRID =
  "md:grid-cols-[56px_minmax(0,2.2fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)_60px]";

/**
 * PlatformBoard — registered integrators ranked by the anchors they bring
 * into the protocol. Each verified anchor pays 25% of its tip to the
 * originating platform's treasury; rows link to that treasury's profile.
 */
const PlatformBoard = ({ platforms }: PlatformBoardProps) => {
  if (platforms.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
        No platforms registered yet — registration is governance-gated.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div
        className={`hidden border-b border-border bg-surface-elevated px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid md:gap-4 ${GRID}`}
      >
        <span>Rank</span>
        <span>Platform</span>
        <span>Fee share</span>
        <span>Anchors originated</span>
        <span>Revenue</span>
        <span>Status</span>
        <span className="text-right">Open</span>
      </div>
      <ul role="list" className="divide-y divide-border">
        {platforms.map((platform, i) => (
          <BoardRow
            key={platform.platformId}
            index={i}
            rank={i + 1}
            href={`/profile/${platform.treasury}`}
            gridClassName={GRID}
          >
            {/* Platform */}
            <div className="flex min-w-0 items-center gap-3">
              <Identicon value={platform.name} size={36} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{platform.name}</p>
                <p
                  className="truncate font-mono text-[11px] text-muted"
                  title={platform.treasury}
                >
                  #{platform.platformId} · {truncateAddress(platform.treasury, 8)}
                </p>
              </div>
            </div>

            {/* Fee share */}
            <span className="hidden font-mono text-sm tabular-nums text-foreground md:block">
              {platform.feeBps / 100}%
            </span>

            {/* Anchors originated */}
            <span className="hidden font-mono text-sm tabular-nums text-foreground md:block">
              {platform.anchorsOriginated.toLocaleString()}
            </span>

            {/* Revenue */}
            <div className="hidden text-sm md:block">
              <span className="font-mono tabular-nums text-foreground">
                {platform.revenueFoc.toLocaleString()}
              </span>
              <span className="ml-1 text-xs text-muted">FOCAT</span>
            </div>

            {/* Status */}
            <span className="hidden md:block">
              <Badge variant={platform.active ? "success" : "danger"} size="sm">
                {platform.active ? "active" : "inactive"}
              </Badge>
            </span>

            {/* Mobile stat line */}
            <div className="col-span-2 mt-1 flex items-center gap-2 font-mono text-[11px] text-muted md:hidden">
              <span>{platform.anchorsOriginated.toLocaleString()} anchors</span>
              <span>·</span>
              <span>{platform.revenueFoc.toLocaleString()} FOCAT</span>
              <span>·</span>
              <span>{platform.feeBps / 100}% share</span>
            </div>
          </BoardRow>
        ))}
      </ul>
    </div>
  );
};

export default PlatformBoard;
