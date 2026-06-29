import { PageShell } from "@/components/layout/PageShell";
import ExplorerSearch from "@/components/explorer/ExplorerSearch";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default function ExplorerPage() {
  return (
    <PageShell size="wide" padding="lg">
      <div className="mb-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Cross-chain indexer
        </p>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground">
          CID Explorer
        </h1>
        <p className="text-muted max-w-2xl">
          Search any CID to see which chains anchored it, the on-chain tx hash, block number, and timestamp. Try one of the seed CIDs to see the full flow.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search</CardTitle>
          <CardDescription>CIDv1 base32 (starts with <code className="font-mono">b</code>).</CardDescription>
        </CardHeader>
        <ExplorerSearch />
      </Card>

      <Card variant="outlined" className="border-dashed">
        <CardHeader>
          <CardTitle>Seeded CIDs</CardTitle>
          <CardDescription>Click to load into the search.</CardDescription>
        </CardHeader>
        <ul className="text-xs font-mono space-y-1 break-all text-muted">
          <li>bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi</li>
          <li>bafybeibv3zaicqsdwfmq5dym6ipxzl5qxksirv3d3uyzjqhs2dtx3w3c3q</li>
          <li>bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku</li>
        </ul>
      </Card>
    </PageShell>
  );
}