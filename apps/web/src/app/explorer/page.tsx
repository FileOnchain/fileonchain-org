import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FiArrowRight, FiSearch } from "react-icons/fi";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import LiveLedgerTicker, {
  StatCounter,
  type LedgerTickerEvent,
} from "@/components/LiveLedgerTicker";
import { formatRelativeTime, truncateCID } from "@/lib/cid/format";
import {
  ACTIVE_CHAINS,
  ACTIVE_FAMILIES,
  CHAIN_FAMILY_LABELS,
  type ChainFamily,
} from "@fileonchain/sdk";
import {
  getExplorerStats,
  getRecentAnchors,
} from "@/lib/indexer/queries";
import RecentAnchorsTable from "@/components/explorer/RecentAnchorsTable";
import ExplorerFilters from "@/components/explorer/ExplorerFilters";

/**
 * ExplorerShell — Etherscan-style home for the multichain CID indexer.
 *
 * Structure (top-to-bottom):
 *   1. Header with kicker + headline + sticky search
 *   2. Animated stats (chains / CIDs / anchors / uploaders)
 *   3. Live ledger ticker (recent anchors flowing under)
 *   4. Browse-by-chain mini cards
 *   5. Recent anchors table w/ family filter
 *
 * Data source: the DB-backed indexer
 * (`lib/indexer/queries`). The category filter was dropped when the
 * indexer moved to on-chain data — categories imply off-chain file
 * metadata (name, MIME) which we don't attest to.
 *
 * This is a server component: it reads `?runtime=X` from the URL and
 * fetches the indexer rows directly. The filter chips link to
 * `/explorer?runtime=X` for a full reload — keeps the surface
 * fully server-rendered (no client DB shim).
 */
interface PageProps {
  searchParams: Promise<{ runtime?: string }>;
}

const isFamily = (v: string | undefined): v is ChainFamily =>
  !!v && ACTIVE_FAMILIES.includes(v as ChainFamily);

/**
 * Server action for the search form. A plain string `action` can't
 * target the dynamic `/explorer/[cid]` route (the literal "[cid]" path
 * would 404), so the redirect happens server-side — which also keeps
 * the form working without client JS.
 */
async function searchCid(formData: FormData) {
  "use server";
  const cid = String(formData.get("cid") ?? "").trim();
  redirect(cid ? `/explorer/${encodeURIComponent(cid)}` : "/explorer");
}

export const dynamic = "force-dynamic";

export default async function ExplorerPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const runtime = isFamily(sp.runtime) ? sp.runtime : "all";
  const [stats, allRows] = await Promise.all([
    getExplorerStats(),
    getRecentAnchors(24, { runtime }),
  ]);
  const rows = allRows.slice(0, 12);

  // Everything decorative on this page is fed by the same indexed rows
  // as the table — no fabricated CIDs, ages, or counts anywhere.
  const now = Date.now();
  const tickerEvents: LedgerTickerEvent[] = allRows.slice(0, 14).map((row) => ({
    cid: row.cid,
    chain: (
      row.hits[0]?.chainShortName ??
      row.hits[0]?.chainName ??
      ""
    ).toUpperCase(),
    time: formatRelativeTime(row.anchoredAt, now),
  }));
  const seedCids = allRows.slice(0, 3).map((r) => r.cid);
  const latestAnchoredAt = allRows[0]?.anchoredAt ?? null;

  return (
    <PageShell size="wide" padding="lg" atmosphere>
      {/* Header ----------------------------------------------- */}
      <section className="space-y-6">
        <PageHeader
          index="02"
          kicker="Cross-chain indexer"
          title="Every anchor, on every chain."
          lede="Every CID that has been publicly anchored on FileOnChain. Search a CID to see which chains committed it, the on-chain tx hash, block number, and submitter. Or browse recent anchors below."
        />

        {/* Search bar — server action redirects to the detail page */}
        <form
          action={searchCid}
          className="flex flex-col gap-2 sm:flex-row"
          role="search"
          aria-label="Search a CID"
        >
          <Input
            name="cid"
            aria-label="CID to search"
            placeholder="Paste a CIDv1 — bafy…"
            leftAddon={<FiSearch size={14} />}
            className="font-mono"
            fullWidth
          />
          <Button type="submit">Search chains</Button>
        </form>

        {/* Quick chips — the newest genuinely indexed CIDs, so every
            chip resolves. Hidden while the index is empty. */}
        {seedCids.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="uppercase tracking-wider text-muted">Recent:</span>
            {seedCids.map((seed) => (
              <Link
                key={seed}
                href={`/explorer/${seed}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-muted transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {truncateCID(seed, 8, 6)}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Stats strip ----------------------------------------- */}
      <section className="mt-10">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-surface p-6 md:grid-cols-4">
          {/* format must be a named variant here — this is a Server
              Component, and function props can't cross into the client
              StatCounter (they aren't serializable and crash the render). */}
          {/* Real indexed counts only — a chain "reports" when the
              indexer has observed an anchor on it, never because the
              registry lists it as active. */}
          <StatCounter
            value={stats.totalChains}
            label="Chains reporting"
            hint="With indexed anchors"
            format="integer"
          />
          <StatCounter
            value={stats.totalFiles}
            label="Distinct CIDs"
            hint="Indexed"
            format="compact"
          />
          <StatCounter
            value={stats.totalAnchors}
            label="Onchain anchors"
            hint="Across all chains"
            format="compact"
          />
          <StatCounter
            value={stats.uniqueUploaders}
            label="Unique uploaders"
            hint="Distinct submitter addrs"
            format="integer"
          />
        </div>
      </section>

      {/* Ledger ticker — real indexed anchors, newest first; each item
          links to its CID. The pulse only appears while the latest
          anchor is under an hour old, and the section disappears
          entirely on an empty index instead of faking motion. */}
      {tickerEvents.length > 0 && (
        <section className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Ledger activity
            </h2>
            {latestAnchoredAt !== null && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
                {now / 1000 - latestAnchoredAt < 3600 && (
                  <span className="h-1.5 w-1.5 animate-orbit-pulse rounded-full bg-success" />
                )}
                latest {formatRelativeTime(latestAnchoredAt, now)}
              </span>
            )}
          </div>
          <LiveLedgerTicker events={tickerEvents} />
        </section>
      )}

      {/* Browse by chain ------------------------------------- */}
      <section className="mt-12 space-y-4">
        <header className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
              Browse by runtime
            </p>
            <h2 className="mt-1 text-lg font-bold text-foreground">
              Drill into a single runtime
            </h2>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {ACTIVE_FAMILIES.map((runtimeId) => {
            const chains = ACTIVE_CHAINS.filter((c) => c.family === runtimeId);
            const mainnet = chains.filter((c) => !c.testnet).length;
            const testnet = chains.length - mainnet;
            return (
              <Link
                key={runtimeId}
                href={`/explorer?runtime=${runtimeId}`}
                className="group flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {CHAIN_FAMILY_LABELS[runtimeId]}
                  </span>
                  <FiArrowRight
                    size={14}
                    className="text-muted transition-transform duration-base group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </div>
                <p className="font-mono text-2xl font-bold tracking-tight tabular-nums text-foreground">
                  {chains.length}
                </p>
                <p className="text-[11px] text-muted">
                  {mainnet} mainnet · {testnet} testnet
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent anchors table -------------------------------- */}
      <section className="mt-16 space-y-5">
        <header className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
              Recent anchors
            </p>
            <h2 className="mt-1 text-lg font-bold text-foreground">
              Latest public activity
            </h2>
          </div>
          <p className="max-w-sm text-xs text-muted md:text-sm">
            Click any CID to see every chain that anchored it, the on-chain
            tx hash, the chunk breakdown, and other CIDs from the same submitter.
          </p>
        </header>

        <ExplorerFilters runtime={runtime} basePath="/explorer" />

        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface/60 p-10 text-center text-sm text-muted">
            No recent anchors match this runtime yet.
          </p>
        ) : (
          <RecentAnchorsTable rows={rows} />
        )}
      </section>

      {/* Chain coverage footer note — states the indexer's real
          coverage, not the registry's ambitions. */}
      <section className="mt-16 rounded-2xl border border-dashed border-border bg-surface/60 p-5 text-sm text-muted">
        <p>
          The explorer lists every publicly anchored CID its indexer has
          observed —{" "}
          <span className="font-semibold text-foreground">
            {stats.totalChains === 0
              ? "no chains reporting yet"
              : `${stats.totalChains} chain${stats.totalChains === 1 ? "" : "s"} reporting`}
          </span>
          {" "}so far, with coverage growing chain by chain. One chain is
          enough to retrieve a file — adding more is optional and each chain
          charges its own gas.
        </p>
      </section>
    </PageShell>
  );
}