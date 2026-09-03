import { PageShell } from "@/components/layout/PageShell";

/**
 * Route-level loading UI for /explorer/[cid]. The detail page is
 * `force-dynamic` and runs several indexer DB lookups before rendering,
 * so this skeleton commits the navigation immediately instead of leaving
 * the previous page frozen. Mirrors the breadcrumb / header card / tab
 * strip / table silhouette of ExplorerDetailClient.
 */
export default function ExplorerDetailLoading() {
  return (
    <PageShell size="wide" padding="lg">
      <div className="animate-pulse" aria-hidden>
        <div className="mb-4 h-3 w-48 rounded bg-surface-elevated" />
        <div className="rounded-2xl border border-border bg-surface p-5 md:p-7">
          <div className="h-7 w-72 max-w-full rounded bg-surface-elevated" />
          <div className="mt-3 h-4 w-full max-w-xl rounded bg-surface-elevated" />
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-16 rounded bg-surface-elevated" />
                <div className="h-5 w-20 rounded bg-surface-elevated" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 flex gap-4 border-b border-border pb-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 w-20 rounded bg-surface-elevated" />
          ))}
        </div>
        <div className="mt-6 space-y-px overflow-hidden rounded-2xl border border-border bg-surface">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 border-b border-border last:border-b-0" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading the CID detail…</span>
    </PageShell>
  );
}
