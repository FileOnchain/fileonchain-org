"use client";

import * as React from "react";
import Link from "next/link";
import { FiArrowRight, FiSearch } from "react-icons/fi";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import LiveLedgerTicker, { StatCounter } from "@/components/LiveLedgerTicker";
import { compactNumber, truncateCID } from "@/lib/cid/format";
import { CHAINS, CHAIN_FAMILY_LABELS } from "@/lib/chains/registry";
import type { ChainFamily } from "@/types/types";
import type {
  FileCategory,
  ExplorerStats,
  RecentAnchorRow,
} from "@/lib/mock/cid-indexer";
import RecentAnchorsTable from "@/components/explorer/RecentAnchorsTable";
import ExplorerFilters from "@/components/explorer/ExplorerFilters";
import { trackEvent } from "@/lib/analytics";

/**
 * ExplorerShell — Etherscan-style home for the multichain CID indexer.
 *
 * Structure (top-to-bottom):
 *   1. Header with kicker + headline + sticky search
 *   2. Animated stats (chains / files / anchors / bytes / uploaders)
 *   3. Live ledger ticker (recent anchors flowing under)
 *   4. Browse-by-chain mini cards
 *   5. Recent anchors table w/ family + type filters and "load more"
 *
 * All data is loaded via the mock indexer (TODO: swap for real TheGraph /
 * Subscan / Solana RPC queries).
 */
const ExplorerShell = () => {
  const [runtime, setRuntime] = React.useState<ChainFamily | "all">("all");
  const [category, setCategory] = React.useState<FileCategory | "all">("all");
  const [stats, setStats] = React.useState<ExplorerStats | null>(null);
  const [rows, setRows] = React.useState<RecentAnchorRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pageSize, setPageSize] = React.useState(6);

  // Reload rows + stats whenever a filter changes.
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const mod = await import("@/lib/mock/cid-indexer");
      const [s, r] = await Promise.all([
        mod.getExplorerStats(),
        mod.getRecentAnchors(12, { runtime, category }),
      ]);
      if (cancelled) return;
      setStats(s);
      setRows(r);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [runtime, category]);

  const visible = rows.slice(0, pageSize);

  return (
    <PageShell size="wide" padding="lg">
      {/* Header ----------------------------------------------- */}
      <section className="space-y-6">
        <div className="flex flex-col items-start gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
            Cross-chain indexer
          </p>
          <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            CID Explorer.
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted md:text-base">
            Every file that has been publicly anchored on FileOnChain. Search a
            CID to see which chains committed it, the on-chain tx hash, block
            number, and submitter. Or browse recent anchors below.
          </p>
        </div>

        {/* Search bar (sticky visual style, not actually sticky) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const q = String(fd.get("cid") ?? "").trim();
            if (q) {
              trackEvent("cid_search", { source: "explorer_index" });
              window.location.assign(`/explorer/${encodeURIComponent(q)}`);
            }
          }}
          className="flex flex-col gap-2 sm:flex-row"
          role="search"
          aria-label="Search a CID"
        >
          <Input
            name="cid"
            placeholder="bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
            leftAddon={<FiSearch size={14} />}
            fullWidth
          />
          <Button type="submit">Search chains</Button>
        </form>

        {/* Quick chip seeds */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="uppercase tracking-wider text-muted">Try:</span>
          {[
            "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
            "bafybeibv3zaicqsdwfmq5dym6ipxzl5qxksirv3d3uyzjqhs2dtx3w3c3q",
            "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
          ].map((seed) => (
            <Link
              key={seed}
              href={`/explorer/${seed}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-muted transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {truncateCID(seed, 8, 6)}
            </Link>
          ))}
        </div>
      </section>

      {/* Stats strip ----------------------------------------- */}
      <section className="mt-10">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-surface p-6 md:grid-cols-5">
          <StatCounter
            value={stats?.totalChains ?? 10}
            label="Chains reporting"
            hint="EVM · Substrate · Solana · Aptos"
            format={(n) => Math.round(n).toString()}
          />
          <StatCounter
            value={stats?.totalFiles ?? 0}
            label="Public files"
            hint="Indexed"
            format={(n) => compactNumber(n)}
          />
          <StatCounter
            value={stats?.totalAnchors ?? 0}
            label="Onchain anchors"
            hint="Across all chains"
            format={(n) => compactNumber(n)}
          />
          <StatCounter
            value={stats?.totalBytes ?? 0}
            label="Bytes anchored"
            hint="Total payload"
            format={(n) => compactNumber(n / 1_000_000, 1)}
            suffix="MB"
          />
          <StatCounter
            value={stats?.uniqueUploaders ?? 0}
            label="Unique uploaders"
            hint="Distinct submitter addrs"
            format={(n) => Math.round(n).toString()}
          />
        </div>
      </section>

      {/* Live ticker ----------------------------------------- */}
      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Live ledger activity
          </h2>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 animate-orbit-pulse rounded-full bg-success" />
            streaming
          </span>
        </div>
        <LiveLedgerTicker />
      </section>

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
          {(["evm", "substrate", "solana", "aptos"] as ChainFamily[]).map(
            (runtimeId) => {
              const chains = CHAINS.filter((c) => c.family === runtimeId);
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
            },
          )}
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
            Click any file to see every chain that anchored it, the on-chain
            tx hash, the chunk breakdown, and other files from the same submitter.
          </p>
        </header>

        <ExplorerFilters
          runtime={runtime}
          category={category}
          onRuntimeChange={setRuntime}
          onCategoryChange={setCategory}
        />

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg border border-border bg-surface"
              />
            ))}
          </div>
        ) : (
          <>
            <RecentAnchorsTable rows={visible} />
            {rows.length > pageSize && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setPageSize((p) => p + 6)}
                >
                  Load more
                </Button>
              </div>
            )}
            {rows.length === 0 && (
              <p className="text-center text-sm text-muted">
                No recent anchors match this combination of filters.
              </p>
            )}
          </>
        )}
      </section>

      {/* Chain coverage footer note --------------------------- */}
      <section className="mt-16 rounded-2xl border border-dashed border-border bg-surface/60 p-5 text-sm text-muted">
        <p>
          The explorer indexes every CID that has been publicly anchored on the
          registry contracts across <span className="font-semibold text-foreground">{CHAINS.length} supported chains</span>.
          One chain is enough to retrieve a file — adding more chains is optional and
          each chain charges its own gas. Some testnet anchors are reported as
          {" "}<span className="font-semibold text-warning">pending</span> until finality; status codes follow the
          convention used by Etherscan and Subscan.
        </p>
      </section>
    </PageShell>
  );
};

export default ExplorerShell;
