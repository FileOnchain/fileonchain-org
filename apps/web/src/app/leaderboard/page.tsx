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

/* ----------------------------------------------------------------------------
 * Sorting
 * --------------------------------------------------------------------------- */

type UploaderSort = "anchors" | "bytes" | "donated";

const UPLOADER_SORTS: Array<{ key: UploaderSort; label: string }> = [
  { key: "anchors", label: "Most anchors" },
  { key: "bytes", label: "Most bytes" },
  { key: "donated", label: "Top donors" },
];

const sortProfiles = (profiles: PublicProfile[], sort: UploaderSort): PublicProfile[] =>
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

/* ----------------------------------------------------------------------------
 * Small shared pieces
 * --------------------------------------------------------------------------- */

const SortChips = <K extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: K; label: string }>;
  value: K;
  onChange: (key: K) => void;
}) => (
  <div className="mb-4 flex flex-wrap items-center gap-2">
    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
      Rank by
    </span>
    {options.map(({ key, label }) => (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        aria-pressed={value === key}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-base",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          value === key
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground",
        )}
      >
        {label}
      </button>
    ))}
  </div>
);

const LoadingRows = () => (
  <div className="space-y-2">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-surface" />
    ))}
  </div>
);

/**
 * LeaderboardShell — the uploader board: identities ranked by public anchors,
 * bytes kept alive, and public-cache donations. Data comes from the mock
 * profile layer (TODO: real indexer reads).
 */
const LeaderboardShell = () => {
  const [profiles, setProfiles] = React.useState<PublicProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploaderSort, setUploaderSort] = React.useState<UploaderSort>("anchors");

  React.useEffect(() => {
    let cancelled = false;
    // Dynamic import keeps the mock layer (and its viem dependency) out of
    // the initial bundle, matching how the rest of the app loads chain code.
    void import("@/lib/mock/profiles")
      .then((mod) => mod.getLeaderboard())
      .then((boardProfiles) => {
        if (cancelled) return;
        setProfiles(boardProfiles);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rankedProfiles = React.useMemo(
    () => sortProfiles(profiles, uploaderSort),
    [profiles, uploaderSort],
  );

  const totalBytes = profiles.reduce((acc, p) => acc + p.stats.bytes, 0);
  const totalAnchors = profiles.reduce((acc, p) => acc + p.stats.anchors, 0);
  const totalDonated = profiles.reduce((acc, p) => acc + p.stats.donatedUsdc, 0);

  return (
    <PageShell size="wide" padding="lg" atmosphere>
      <PageHeader
        className="mb-8"
        index="06"
        kicker="Community ledger"
        title="The uploader leaderboard."
        lede="The identities keeping data verifiable: ranked by anchors written, bytes kept alive on-chain, and donations funding the public cache."
      />

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

      <SortChips options={UPLOADER_SORTS} value={uploaderSort} onChange={setUploaderSort} />
      {loading ? <LoadingRows /> : <LeaderboardTable profiles={rankedProfiles} />}

      <section className="mt-12 rounded-2xl border border-dashed border-border bg-surface/60 p-5 text-sm text-muted">
        <p>
          Rankings aggregate public anchors per identity. Wallets{" "}
          <Link
            href="/profile"
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            linked on your profile
          </Link>{" "}
          are counted together, so anchoring from a Solana wallet and an EVM wallet builds one
          reputation instead of two. Donations to the public cache are tracked separately and
          never affect the anchor ranking.
        </p>
      </section>
    </PageShell>
  );
};

export default LeaderboardShell;
