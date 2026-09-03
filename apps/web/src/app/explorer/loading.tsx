import { PageShell } from "@/components/layout/PageShell";

/**
 * Route-level loading UI for /explorer. The index is `force-dynamic` and
 * reads the indexer DB, so without this the navigation has zero feedback
 * until the queries resolve. Mirrors the page's header / stats / table
 * silhouette.
 */
export default function ExplorerLoading() {
  return (
    <PageShell size="wide" padding="lg" atmosphere>
      <div className="animate-pulse space-y-10" aria-hidden>
        <div className="space-y-4">
          <div className="h-3 w-40 rounded bg-surface-elevated" />
          <div className="h-9 w-2/3 max-w-xl rounded-lg bg-surface-elevated" />
          <div className="h-4 w-full max-w-2xl rounded bg-surface-elevated" />
          <div className="h-11 w-full rounded-md bg-surface-elevated" />
        </div>
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-surface p-6 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-7 w-16 rounded bg-surface-elevated" />
              <div className="h-3 w-24 rounded bg-surface-elevated" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-lg border border-border bg-surface"
            />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading the explorer…</span>
    </PageShell>
  );
}
