import { redirect } from "next/navigation";
import { FiFolder } from "react-icons/fi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CloudShell } from "@/components/cloud/CloudShell";
import { PlannedBadge } from "@/components/cloud/PlannedBadge";
import { auth } from "@/lib/auth";
import {
  getProject,
  listProjectMembers,
} from "@/lib/server/projects";
import { getActiveProjectSigner } from "@/lib/server/cloud-signer";
import { isCloudTenancyEnabled } from "@/lib/server/cloud-feature";
import { QuotaEditor } from "@/components/cloud/QuotaEditor";
import { ProjectMembersEditor } from "@/components/cloud/ProjectMembersEditor";
import { ProjectSignerManager } from "@/components/cloud/ProjectSignerManager";
import Link from "next/link";

/**
 * /cloud/projects/[id] — single project detail. Members / quotas /
 * Cloud signer. Lead-only mutations.
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CloudProjectDetailPage({ params }: PageProps) {
  const enabled = isCloudTenancyEnabled();
  const session = await auth();
  if (!session?.user) redirect("/login?next=/cloud/projects");
  const { id } = await params;

  if (!enabled) {
    return (
      <CloudShell enabled={enabled} surfaceLabel="Project detail">
        <PageHeader
          className="mb-8"
          index="03.5"
          kicker="Cloud · Projects"
          title="Project detail"
          actions={<PlannedBadge />}
        />
        <EmptyState
          icon={<FiFolder size={20} />}
          title="Projects are in development"
          description="Open by setting FILEONCHAIN_CLOUD_TENANCY_ENABLED=1."
        />
      </CloudShell>
    );
  }

  let project;
  let members;
  try {
    project = await getProject(session.user.id, id);
    members = await listProjectMembers(session.user.id, id);
  } catch {
    redirect("/cloud/projects");
  }
  const canManage = project.role === "lead";
  const signer = await getActiveProjectSigner(project.id);

  return (
    <CloudShell enabled={enabled} surfaceLabel={`Project · ${project.name}`}>
      <PageHeader
        className="mb-8"
        index="03.5"
        kicker="Cloud · Project"
        title={project.name}
        lede={`Org ${project.orgId.slice(0, 8)}…, role ${project.role}. The Cloud added a "${project.slug}" slug.`}
        actions={<PlannedBadge />}
      />
      <div className="space-y-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Quotas</h3>
          <p className="mt-2 text-sm text-muted">
            Per-project monthly caps. NULL = unlimited. Counter source of
            truth is the rows on <code>evidence_envelope.project_id</code> and
            <code> upload_job.project_id</code>.
          </p>
          <QuotaEditor
            projectId={project.id}
            initial={{
              envelopesPerMonth: project.envelopesPerMonth,
              anchorsPerMonth: project.anchorsPerMonth,
              bytesAnchoredPerMonth: project.bytesAnchoredPerMonth,
              retentionDays: project.retentionDays,
            }}
            canManage={canManage}
          />
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Members</h3>
          <ProjectMembersEditor
            projectId={project.id}
            members={members.map((m) => ({
              userId: m.userId,
              role: m.role,
              joinedAt: m.joinedAt.toISOString(),
            }))}
            canManage={canManage}
          />
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Project Cloud signer</h3>
          <p className="mt-2 text-sm text-muted">
            Optional. A per-project ed25519 signer adds an envelope signature
            under <code>fileonchain-cloud:project:&lt;id&gt;</code> — never an
            artifact signature.
          </p>
          <ProjectSignerManager
            projectId={project.id}
            signer={
              signer
                ? {
                    publicKey: signer.publicKey,
                    keyPreview: signer.keyPreview,
                    createdAt: signer.createdAt,
                    revokedAt: signer.revokedAt,
                  }
                : null
            }
            canManage={canManage}
          />
        </Card>
        <p>
          <Link href="/cloud/projects" className="text-sm text-primary underline">
            ← Back to projects
          </Link>
        </p>
      </div>
    </CloudShell>
  );
}
