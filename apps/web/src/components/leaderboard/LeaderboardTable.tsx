"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FiArrowRight } from "react-icons/fi";
import { ACTIVE_FAMILIES } from "@fileonchain/sdk";
import { Identicon } from "@/components/ui/Identicon";
import RuntimeChip from "@/components/profile/RuntimeChip";
import type { PublicProfile } from "@/lib/mock/profiles";
import { formatBytes, truncateAddress } from "@/lib/cid/format";

interface LeaderboardTableProps {
  profiles: PublicProfile[];
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * LeaderboardTable — ranked uploader list in the explorer table idiom.
 * Every row links to the uploader's public profile. The top three ranks
 * get the primary accent so the podium reads at a glance.
 */
const LeaderboardTable = ({ profiles }: LeaderboardTableProps) => {
  if (profiles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
        No ranked uploaders yet — anchor a file to appear here.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="hidden border-b border-border bg-surface-elevated px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid md:grid-cols-[56px_minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_60px] md:gap-4">
        <span>Rank</span>
        <span>Uploader</span>
        <span>Runtimes</span>
        <span>Files</span>
        <span>Bytes · Anchors</span>
        <span>Donated</span>
        <span className="text-right">Open</span>
      </div>
      <ul role="list" className="divide-y divide-border">
        {profiles.map((profile, i) => {
          const rank = profile.rank ?? i + 1;
          const podium = rank <= 3;
          const linkedFamilies = new Set(
            profile.linkedWallets.map((w) => w.family),
          );
          linkedFamilies.add(profile.family);
          return (
            <motion.li
              key={profile.address}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04, ease: EASE_OUT }}
              className="group relative"
            >
              <Link
                href={`/profile/${profile.address}`}
                className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:grid-cols-[56px_minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_60px] md:gap-4"
              >
                {/* Hover highlight bar */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-primary transition-transform duration-base ease-out-soft group-hover:scale-y-100"
                />

                {/* Rank */}
                <span
                  className={
                    podium
                      ? "font-mono text-lg font-semibold tabular-nums text-primary"
                      : "font-mono text-lg tabular-nums text-muted"
                  }
                >
                  {String(rank).padStart(2, "0")}
                </span>

                {/* Uploader */}
                <div className="flex min-w-0 items-center gap-3">
                  {/* Seed with the handle when present — address-seeded initials
                      all render "0X", which reads as identical avatars. */}
                  <Identicon value={profile.handle ?? profile.address} size={36} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">
                      {profile.handle ?? truncateAddress(profile.address)}
                    </p>
                    <p
                      className="truncate font-mono text-[11px] text-muted"
                      title={profile.address}
                    >
                      {truncateAddress(profile.address, 8)}
                    </p>
                  </div>
                </div>

                {/* Runtimes — only families with a network open for uploads;
                    a chip lights up when the profile has a wallet there. */}
                <div className="hidden flex-wrap items-center gap-1 md:flex">
                  {ACTIVE_FAMILIES.map((family) => (
                    <RuntimeChip
                      key={family}
                      family={family}
                      active={linkedFamilies.has(family)}
                    />
                  ))}
                </div>

                {/* Files */}
                <span className="hidden font-mono text-sm tabular-nums text-foreground md:block">
                  {profile.stats.files}
                </span>

                {/* Bytes · anchors */}
                <div className="hidden text-sm md:block">
                  <span className="font-mono tabular-nums text-foreground">
                    {formatBytes(profile.stats.bytes)}
                  </span>
                  <span className="ml-2 text-xs text-muted">
                    · {profile.stats.anchors} anchors
                  </span>
                </div>

                {/* Donated */}
                <span className="hidden font-mono text-sm tabular-nums text-foreground md:block">
                  {profile.stats.donatedUsdc}
                  <span className="ml-1 text-xs text-muted">USDC</span>
                </span>

                {/* Mobile stat line */}
                <div className="col-span-2 mt-1 flex items-center gap-2 font-mono text-[11px] text-muted md:hidden">
                  <span>{profile.stats.files} files</span>
                  <span>·</span>
                  <span>{formatBytes(profile.stats.bytes)}</span>
                  <span>·</span>
                  <span>{profile.stats.donatedUsdc} USDC</span>
                </div>

                {/* Open */}
                <span
                  aria-hidden
                  className="hidden h-8 w-8 items-center justify-center justify-self-end rounded-full border border-border text-foreground transition-all duration-base ease-out-soft group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground md:flex"
                >
                  <FiArrowRight
                    size={14}
                    className="transition-transform duration-base group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
};

export default LeaderboardTable;
