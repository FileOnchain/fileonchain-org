import { redirect } from "next/navigation";
import { FiDownload } from "react-icons/fi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CloudShell } from "@/components/cloud/CloudShell";
import { PlannedBadge } from "@/components/cloud/PlannedBadge";
import { OrgSelect } from "@/components/cloud/OrgSelect";
import { auth } from "@/lib/auth";
import { listOrganizations } from "@/lib/server/organizations";
import { isCloudExportsEnabled } from "@/lib/server/cloud-feature";
import { listExportJobs } from "@/lib/server/exports";
import { ExportsList } from "@/components/cloud/ExportsList";

/**
 * /cloud/exports — bulk `.evidence.json` export jobs under an org.
 * Server component fetches the most recent 20 jobs and hands them to
 * the ExportsList client component for status / download buttons.
 */

interface PageProps {
  searchParams: Promise<{ orgId?: string }>;
}

export default async function CloudExportsPage({ searchParams }: PageProps) {
  const enabled = isCloudExportsEnabled();
  const session = await auth();
  if (!session?.user) redirect("/login?next=/cloud/exports");
  const params = await searchParams;
  const orgs = await listOrganizations(session.user.id);
  const effectiveOrgId =
    (typeof params.orgId === "string" &&
    orgs.some((o) => o.id === params.orgId)
      ? params.orgId
      : orgs[0]?.id) ?? null;
  const jobs = enabled && effectiveOrgId
    ? await listExportJobs(effectiveOrgId, { limit: 20 })
    : [];

  return (
    <CloudShell enabled={enabled} surfaceLabel="Exports">
      <PageHeader
        className="mb-8"
        index="03.7"
        kicker="Cloud · Exports"
        title="Bulk envelope exports"
        lede="Stream every envelope (or a filtered subset) into a signed download. The Cloud builds the archive server-side; download links expire 24 hours after the build completes."
        actions={<PlannedBadge />}
      />

      {!enabled ? (
        <EmptyState
          icon={<FiDownload size={20} />}
          title="Exports are in development"
          description="The backend, schema, and pages ship in this build. Open by setting FILEONCHAIN_CLOUD_EXPORTS_ENABLED=1."
        />
      ) : orgs.length === 0 ? (
        <EmptyState
          icon={<FiDownload size={20} />}
          title="No organizations yet"
          description="Exports are org-scoped. Create or join an organization first."
        />
      ) : (
        <div className="space-y-6">
          {orgs.length > 1 && (
            <Card className="p-5">
              <OrgSelect
                orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
                selectedOrgId={effectiveOrgId}
              />
            </Card>
          )}
          <Card className="p-5">
            <h3 className="text-sm font-semibold">Recent exports</h3>
            {jobs.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                No exports yet. Use POST /api/v1/exports with an
                org-scoped API key to start one.
              </p>
            ) : (
              <ExportsList
                jobs={jobs.map((j) => ({
                  id: j.id,
                  status: j.status,
                  envelopeCount: j.envelopeCount,
                  byteSize: j.byteSize,
                  expiresAt: j.expiresAt?.toISOString() ?? null,
                  error: j.error,
                  createdAt: j.createdAt.toISOString(),
                }))}
              />
            )}
          </Card>
        </div>
      )}
    </CloudShell>
  );
}
