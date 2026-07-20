import Link from "next/link";
import { redirect } from "next/navigation";
import { FiSearch } from "react-icons/fi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CloudShell } from "@/components/cloud/CloudShell";
import { PlannedBadge } from "@/components/cloud/PlannedBadge";
import { OrgSelect } from "@/components/cloud/OrgSelect";
import { auth } from "@/lib/auth";
import { searchEvidence } from "@/lib/server/evidence";
import { listOrganizations } from "@/lib/server/organizations";
import { isCloudEvidenceEnabled } from "@/lib/server/cloud-feature";

/**
 * /cloud/search — server-rendered search UI. A GET form posts via the
 * page's own URL (`?query=…&orgId=…`); the page reads `searchParams`
 * directly so navigation is bookmarkable. Hits come from
 * `searchEvidence`, the same service that backs `GET /api/v1/evidence`.
 * Multi-org users switch scope with the shared `OrgSelect`, which sets
 * `?orgId=` while preserving the current query.
 *
 * The page is gated like every other `/cloud/*` surface.
 */

interface PageProps {
  searchParams: Promise<{ query?: string; orgId?: string }>;
}

export default async function CloudSearchPage({ searchParams }: PageProps) {
  const enabled = isCloudEvidenceEnabled();
  const session = await auth();
  if (!session?.user) redirect("/login?next=/cloud/search");

  const params = await searchParams;
  const query = typeof params.query === "string" ? params.query : "";
  const orgs = enabled ? await listOrganizations(session.user.id) : [];

  // Scope to the org named in the URL (validated against membership) or the
  // first org otherwise. The OrgSelect below lets multi-org users switch.
  const effectiveOrgId =
    (typeof params.orgId === "string" &&
    orgs.some((o) => o.id === params.orgId)
      ? params.orgId
      : orgs[0]?.id) ?? null;

  let hits: Awaited<ReturnType<typeof searchEvidence>> = [];
  let searchError: string | null = null;

  if (enabled && effectiveOrgId && query) {
    try {
      hits = await searchEvidence(
        {
          id: "preview",
          userId: session.user.id,
          orgId: effectiveOrgId,
          projectId: null,
          scope: "org",
        },
        query,
        { limit: 20 },
      );
    } catch (err) {
      searchError = err instanceof Error ? err.message : "Search failed";
    }
  }

  return (
    <CloudShell enabled={enabled} surfaceLabel="Search">
      <PageHeader
        className="mb-8"
        index="03.4"
        kicker="Cloud · Search"
        title="Search across your evidence"
        lede="Claim-level + signer search over the org's envelopes, backed by a Postgres tsvector generated column. Empty query lists the most recent 20."
        actions={<PlannedBadge />}
      />

      {!enabled ? (
        <EmptyState
          icon={<FiSearch size={20} />}
          title="Search is in development"
          description="The backend, schema, and GET /api/v1/evidence ship in this build. The UI and the route are not reachable for users until FILEONCHAIN_CLOUD_EVIDENCE_ENABLED is set."
        />
      ) : orgs.length === 0 ? (
        <EmptyState
          icon={<FiSearch size={20} />}
          title="No organizations yet"
          description="Search is org-scoped. Create or join an organization, then mint an org-scoped API key to ingest envelopes."
        />
      ) : (
        <Card className="p-5">
          {orgs.length > 1 && (
            <div className="mb-4 max-w-xs">
              <OrgSelect
                orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
                selectedOrgId={effectiveOrgId}
              />
            </div>
          )}
          <form action="/cloud/search" method="get" className="flex flex-wrap items-end gap-3">
            {effectiveOrgId && (
              <input type="hidden" name="orgId" value={effectiveOrgId} />
            )}
            <div className="grow">
              <label
                htmlFor="cloud-search-query"
                className="text-sm font-medium text-foreground"
              >
                Query
              </label>
              <input
                id="cloud-search-query"
                name="query"
                type="search"
                defaultValue={query}
                placeholder="e.g. org.fileonchain.agent"
                className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Search
            </button>
          </form>

          {searchError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {searchError}
            </p>
          )}

          {query && hits.length === 0 && !searchError && (
            <p className="mt-4 text-sm text-muted">
              No envelopes match <code className="font-mono text-xs">{query}</code>.
            </p>
          )}

          {hits.length > 0 && (
            <ul className="mt-4 divide-y divide-border">
              {hits.map((hit) => (
                <li key={hit.envelopeId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/cloud/verify/${hit.envelopeId}`}
                      className="text-sm font-medium text-primary underline underline-offset-2"
                    >
                      {hit.subjectSha256 ?? hit.envelopeDigest.slice(0, 16) + "…"}
                    </Link>
                    {hit.profile && (
                      <span className="ml-2 font-mono text-[11px] text-muted">
                        {hit.profile}
                      </span>
                    )}
                    <p
                      className="mt-1 text-xs text-muted"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: hit.snippet }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-muted">
                    {new Date(hit.createdAt).toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </CloudShell>
  );
}
