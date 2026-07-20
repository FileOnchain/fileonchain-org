import * as React from "react";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import { StatCounter } from "@/components/LiveLedgerTicker";
import { formatBytes } from "@/lib/cid/format";
import type { PublicProfile } from "@/lib/mock/profiles";
import { getLeaderboard } from "@/lib/mock/profiles";

/* ----------------------------------------------------------------------------
 * Sorting — runs server-side once per request, no client round-trip.
 * --------------------------------------------------------------------------- */

type UploaderSort = "anchors" | "bytes" | "donated";

const sortProfiles = (
  profiles: PublicProfile[],
  sort: UploaderSort,
): PublicProfile[] =>
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
 * Server component — fetches the leaderboard server-side. The sort chips
 * below re-render the page via URL search params so the sort stays
 * server-rendered (no client DB shim).
 * --------------------------------------------------------------------------- */

interface PageProps {
  searchParams: Promise<{ sort?: string }>;
}

export const dynamic = "force-dynamic";

const isSort = (v: string | undefined): v is UploaderSort =>
  v === "anchors" || v === "bytes" || v === "donated";

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sort: UploaderSort = isSort(sp.sort) ? sp.sort : "anchors";
  const profiles = await getLeaderboard();
  const rankedProfiles = sortProfiles(profiles, sort);

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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
          Rank by
        </span>
        {(
          [
            { key: "anchors", label: "Most anchors" },
            { key: "bytes", label: "Most bytes" },
            { key: "donated", label: "Top donors" },
          ] as Array<{ key: UploaderSort; label: string }>
        ).map(({ key, label }) => {
          const isActive = sort === key;
          const href = key === "anchors" ? "/leaderboard" : `/leaderboard?sort=${key}`;
          return (
            <Link
              key={key}
              href={href}
              scroll={false}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                (isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground")
              }
            >
              {label}
            </Link>
          );
        })}
      </div>

      <LeaderboardTable profiles={rankedProfiles} />

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
}