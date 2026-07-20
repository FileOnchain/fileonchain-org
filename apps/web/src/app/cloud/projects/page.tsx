import { redirect } from "next/navigation";
import { FiFolder } from "react-icons/fi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CloudShell } from "@/components/cloud/CloudShell";
import { PlannedBadge } from "@/components/cloud/PlannedBadge";
import { OrgSelect } from "@/components/cloud/OrgSelect";
import { auth } from "@/lib/auth";
import { listOrganizations } from "@/lib/server/organizations";
import { listProjects } from "@/lib/server/projects";
import {
  isCloudTenancyEnabled,
  isCloudEvidenceEnabled,
} from "@/lib/server/cloud-feature";
import { CreateProjectForm } from "@/components/cloud/CreateProjectForm";
import { ProjectList } from "@/components/cloud/ProjectList";

/**
 * /cloud/projects — projects under an org. Server component: lists
 * projects the user is a member of, with a create form gated on
 * `lead`/`contributor` at the org level (any member can create). The
 * feature is gated behind both `FILEONCHAIN_CLOUD_TENANCY_ENABLED` and
 * the broader `FILEONCHAIN_CLOUD_EVIDENCE_ENABLED`.
 */

interface PageProps {
  searchParams: Promise<{ orgId?: string }>;
}

export default async function CloudProjectsPage({ searchParams }: PageProps) {
  const enabled = isCloudTenancyEnabled();
  const session = await auth();
  if (!session?.user) redirect("/login?next=/cloud/projects");
  const params = await searchParams;
  const orgs = await listOrganizations(session.user.id);
  const effectiveOrgId =
    (typeof params.orgId === "string" &&
    orgs.some((o) => o.id === params.orgId)
      ? params.orgId
      : orgs[0]?.id) ?? null;
  const activeOrg = orgs.find((o) => o.id === effectiveOrgId) ?? null;
  const projects = enabled && effectiveOrgId
    ? await listProjects(session.user.id, effectiveOrgId)
    : [];

  return (
    <CloudShell enabled={enabled} surfaceLabel="Projects">
      <PageHeader
        className="mb-8"
        index="03.5"
        kicker="Cloud · Projects"
        title="Projects inside your organization"
        lede="Projects are a sub-org tenancy — a per-project Cloud signer can attribute envelope-seal steps to the project, and per-project monthly quotas keep noisy keys from overrunning the org. Both are opt-in."
        actions={<PlannedBadge />}
      />

      {!isCloudEvidenceEnabled() ? (
        <EmptyState
          icon={<FiFolder size={20} />}
          title="Cloud evidence surface is not enabled"
          description="Set FILEONCHAIN_CLOUD_EVIDENCE_ENABLED=1 in addition to FILEONCHAIN_CLOUD_TENANCY_ENABLED to open projects."
        />
      ) : !enabled ? (
        <EmptyState
          icon={<FiFolder size={20} />}
          title="Projects are in development"
          description="The backend, schema, and pages ship in this build. Open by setting FILEONCHAIN_CLOUD_TENANCY_ENABLED=1."
        />
      ) : orgs.length === 0 ? (
        <EmptyState
          icon={<FiFolder size={20} />}
          title="No organizations yet"
          description="Projects live inside an organization — create or join one first."
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
            <h3 className="text-sm font-semibold">New project</h3>
            <p className="mt-2 text-sm text-muted">
              Creates a sub-org tenancy with its own slug + members. You
              become its first lead.
            </p>
            {effectiveOrgId && activeOrg ? (
              <CreateProjectForm orgId={effectiveOrgId} />
            ) : null}
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold">Projects</h3>
            {projects.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No projects yet.</p>
            ) : (
              <ProjectList projects={projects} />
            )}
          </Card>
        </div>
      )}
    </CloudShell>
  );
}
