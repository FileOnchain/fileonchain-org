"use client";

import * as React from "react";
import { FiSearch } from "react-icons/fi";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ExplorerHitCard } from "./ExplorerHitCard";
import { validateOrError } from "@/lib/cid/validate";
import { searchCID } from "@/lib/mock/cid-indexer";

interface ExplorerSearchProps {
  initialQuery?: string;
}

/**
 * ExplorerSearch — input + results panel. Looks up CIDs across all chains
 * via the mock indexer. Real implementation will swap to The Graph / Subscan.
 */
export const ExplorerSearch = ({ initialQuery = "" }: ExplorerSearchProps) => {
  const [query, setQuery] = React.useState(initialQuery);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<Awaited<ReturnType<typeof searchCID>>>([]);
  const [hasSearched, setHasSearched] = React.useState(false);

  const runSearch = async (q: string) => {
    const validationError = validateOrError(q);
    if (validationError) {
      setError(validationError);
      setResults([]);
      setHasSearched(false);
      return;
    }
    setError(null);
    setLoading(true);
    setHasSearched(true);
    try {
      const hits = await searchCID(q);
      setResults(hits);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (initialQuery) void runSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(query);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
          error={error ?? undefined}
          leftAddon={<FiSearch size={14} />}
          fullWidth
        />
        <Button type="submit" isLoading={loading}>
          Search chains
        </Button>
      </form>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton height={120} />
          <Skeleton height={120} />
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && (
        <EmptyState
          icon={<FiSearch size={20} />}
          title="No results"
          description="Try a seeded CID like bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
          action={<Button onClick={() => setQuery("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")}>Try a seed</Button>}
        />
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Found <strong>{results.length}</strong> {results.length === 1 ? "chain" : "chains"} with{" "}
            <code className="font-mono">{query}</code>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((hit) => (
              <ExplorerHitCard key={hit.chainId} hit={hit} cid={query} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExplorerSearch;