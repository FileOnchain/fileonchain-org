import { PageShell } from "@/components/layout/PageShell";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { searchCID } from "@/lib/mock/cid-indexer";
import { validateOrError } from "@/lib/cid/validate";
import { truncateCID } from "@/lib/cid/format";
import ExplorerHitCard from "@/components/explorer/ExplorerHitCard";
import DataRebuilder from "@/components/explorer/DataRebuilder";

interface PageProps {
  params: Promise<{ cid: string }>;
}

export const dynamic = "force-dynamic";

export default async function ExplorerCIDPage({ params }: PageProps) {
  const { cid } = await params;
  const error = validateOrError(cid);
  if (error) {
    return (
      <PageShell size="wide" padding="lg">
        <Card>
          <CardHeader>
            <CardTitle>Invalid CID</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </PageShell>
    );
  }

  const hits = await searchCID(cid);

  return (
    <PageShell size="wide" padding="lg">
      <div className="mb-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          CID detail
        </p>
        <div className="flex items-center gap-2 break-all">
          <h1 className="font-mono text-base md:text-lg text-foreground" title={cid}>
            {truncateCID(cid, 16, 12)}
          </h1>
          <CopyButton value={cid} ariaLabel="Copy full CID" />
        </div>
        <p className="text-muted text-sm">
          Found on {hits.length} {hits.length === 1 ? "chain" : "chains"}. Chain-specific anchors and tx hashes below.
        </p>
      </div>

      {hits.length > 0 && (
        <div className="mb-6">
          <DataRebuilder cid={cid} chainCount={hits.length} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {hits.map((hit) => (
          <ExplorerHitCard key={hit.chainId} hit={hit} cid={cid} />
        ))}
      </div>

      {hits.length === 0 && (
        <Card variant="outlined" className="border-dashed">
          <CardHeader>
            <CardTitle>No chains report this CID</CardTitle>
            <CardDescription>
              The mock indexer only knows a small set of seeded CIDs. Try one of the examples on the explorer index.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </PageShell>
  );
}