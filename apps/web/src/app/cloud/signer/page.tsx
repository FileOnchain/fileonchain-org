import { redirect } from "next/navigation";
import { FiKey } from "react-icons/fi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CloudShell } from "@/components/cloud/CloudShell";
import { PlannedBadge } from "@/components/cloud/PlannedBadge";
import { OrgSelect } from "@/components/cloud/OrgSelect";
import { SignerManager } from "@/components/cloud/SignerManager";
import { auth } from "@/lib/auth";
import { listOrganizations } from "@/lib/server/organizations";
import {
  getActiveOrgSigner,
  cloudSignerStatusUrl,
} from "@/lib/server/cloud-signer";
import { isCloudEvidenceEnabled } from "@/lib/server/cloud-feature";

/**
 * /cloud/signer — per-org Cloud signing key manager. Owners/admins generate,
 * rotate, or revoke the `service` key the Cloud uses for `server_sign`
 * (adding an ENVELOPE signature at ingest, never an artifact signature).
 * Server component; the effective org comes from `?orgId=` via the shared
 * OrgSelect, defaulting to the first org.
 */

interface PageProps {
  searchParams: Promise<{ orgId?: string }>;
}

export default async function CloudSignerPage({ searchParams }: PageProps) {
  const enabled = isCloudEvidenceEnabled();
  const session = await auth();
  if (!session?.user) redirect("/login?next=/cloud/signer");

  const params = await searchParams;
  const orgs = enabled ? await listOrganizations(session.user.id) : [];
  const effectiveOrgId =
    (typeof params.orgId === "string" &&
    orgs.some((o) => o.id === params.orgId)
      ? params.orgId
      : orgs[0]?.id) ?? null;

  // Only owners/admins may manage the key; members see a read-only note.
  const activeOrg = orgs.find((o) => o.id === effectiveOrgId) ?? null;
  const canManage = activeOrg?.role === "owner" || activeOrg?.role === "admin";
  const signer =
    enabled && effectiveOrgId ? await getActiveOrgSigner(effectiveOrgId) : null;

  return (
    <CloudShell enabled={enabled} surfaceLabel="Server-side signer">
      <PageHeader
        className="mb-8"
        index="03.5"
        kicker="Cloud · Signer"
        title="Server-side signer (server_sign)"
        lede="Generate a per-org ed25519 key the Cloud uses to add an envelope signature — a service identity attesting it assembled the envelope — to submissions sent with server_sign. It never signs the artifact, so it makes no claim about who authored the subject."
        actions={<PlannedBadge />}
      />

      {!enabled ? (
        <EmptyState
          icon={<FiKey size={20} />}
          title="Server-side signer is in development"
          description="The key store, signing service, and POST /api/v1/agent-runs?server_sign=1 ship in this build. The management UI is not reachable for users until FILEONCHAIN_CLOUD_EVIDENCE_ENABLED is set."
        />
      ) : orgs.length === 0 ? (
        <EmptyState
          icon={<FiKey size={20} />}
          title="No organizations yet"
          description="The Cloud signer is org-scoped. Create or join an organization to generate one."
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
            {canManage && effectiveOrgId ? (
              <SignerManager
                orgId={effectiveOrgId}
                signer={signer}
                statusUrl={cloudSignerStatusUrl({ kind: "org", orgId: effectiveOrgId })}
              />
            ) : (
              <p className="text-sm text-muted">
                Only owners and admins can manage the Cloud signer for this
                organization.
                {signer
                  ? " A signer is currently active."
                  : " No signer is active yet."}
              </p>
            )}
          </Card>
        </div>
      )}
    </CloudShell>
  );
}
