"use client";

import * as React from "react";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import { StatCounter } from "@/components/LiveLedgerTicker";
import { formatBytes } from "@/lib/cid/format";
import { cn } from "@/lib/cn";
import type { PublicProfile } from "@/lib/mock/profiles";

type SortKey = "anchors" | "bytes" | "donated";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "anchors", label: "Most anchors" },
  { key: "bytes", label: "Most bytes" },
  { key: "donated", label: "Top donors" },
];

const sortProfiles = (profiles: PublicProfile[], sort: SortKey): PublicProfile[] =>
  [...profiles]
    .sort((a, b) => {
      switch (sort) {
        case "bytes":
          return b.stats.bytes - a.stats.bytes;
        case "donated":
          return b.stats.donatedUsdc - a.stats.donatedUsdc;
        default:
          return b.stats.anchors - a.stats.anchors;
      }
    })
    .map((p, i) => ({ ...p, rank: i + 1 }));

/**
 * LeaderboardShell — ranked view of the most active uploaders across every
 * runtime. Data comes from the mock profile layer (TODO: real indexer).
 */
const LeaderboardShell = () => {
  const [profiles, setProfiles] = React.useState<PublicProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sort, setSort] = React.useState<SortKey>("anchors");

  React.useEffect(() => {
    let cancelled = false;
    void import("@/lib/mock/profiles").then(async (mod) => {
      const board = await mod.getLeaderboard();
      if (cancelled) return;
      setProfiles(board);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ranked = React.useMemo(() => sortProfiles(profiles, sort), [profiles, sort]);
  const totalBytes = profiles.reduce((acc, p) => acc + p.stats.bytes, 0);
  const totalAnchors = profiles.reduce((acc, p) => acc + p.stats.anchors, 0);
  const totalDonated = profiles.reduce((acc, p) => acc + p.stats.donatedUsdc, 0);

  return (
    <PageShell size="wide" padding="lg" atmosphere>
      <PageHeader
        className="mb-8"
        index="06"
        kicker="Community ledger"
        title="The anchor leaderboard."
        lede="The uploaders keeping the most data alive onchain — ranked across every runtime. Link your wallets on your profile so your EVM, Substrate, Solana, and Aptos activity counts as one identity."
      />

      {/* Totals strip */}
      <div className="mb-8 grid grid-cols-1 gap-6 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-3 sm:gap-8">
        <StatCounter
          value={totalAnchors}
          label="Anchors on the board"
          hint="All ranked uploaders"
          format={(n) => Math.round(n).toLocaleString()}
        />
        <StatCounter
          value={totalBytes}
          label="Bytes kept alive"
          hint="Across all runtimes"
          format={(n) => formatBytes(n)}
        />
        <StatCounter
          value={totalDonated}
          label="Donated back"
          hint="Public cache funding"
          format={(n) => Math.round(n).toString()}
          suffix=" USDC"
        />
      </div>

      {/* Sort control */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
          Rank by
        </span>
        {SORT_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            aria-pressed={sort === key}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-base",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              sort === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg border border-border bg-surface"
            />
          ))}
        </div>
      ) : (
        <LeaderboardTable profiles={ranked} />
      )}

      {/* How ranking works */}
      <section className="mt-12 rounded-2xl border border-dashed border-border bg-surface/60 p-5 text-sm text-muted">
        <p>
          Rankings aggregate public anchors per identity. Wallets{" "}
          <Link
            href="/profile"
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            linked on your profile
          </Link>{" "}
          are counted together, so anchoring from a Solana wallet and an EVM
          wallet builds one reputation instead of two. Donations to the public
          cache are tracked separately and never affect the anchor ranking.
        </p>
      </section>
    </PageShell>
  );
};

export default LeaderboardShell;
