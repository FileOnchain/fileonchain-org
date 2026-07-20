import { redirect } from "next/navigation";
import { FiClock } from "react-icons/fi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CloudShell } from "@/components/cloud/CloudShell";
import { PlannedBadge } from "@/components/cloud/PlannedBadge";
import { OrgSelect } from "@/components/cloud/OrgSelect";
import { RetentionEditor } from "@/components/cloud/RetentionEditor";
import { auth } from "@/lib/auth";
import { getEffectiveRetention } from "@/lib/server/retention";
import { listOrganizations } from "@/lib/server/organizations";
import { isCloudEvidenceEnabled } from "@/lib/server/cloud-feature";

/**
 * /cloud/retention — per-org retention editor. Server component. The
 * effective window is read so the displayed number is real, and the
 * editor writes through the session-authed
 * `PATCH /api/organizations/[id]/retention` route (owner/admin only). New
 * envelopes are stamped with `expires_at` at submit time
 * (`applyRetentionToNewEnvelope`); the sweep deletes rows past their expiry.
 */

interface PageProps {
  searchParams: Promise<{ orgId?: string }>;
}

export default async function CloudRetentionPage({ searchParams }: PageProps) {
  const enabled = isCloudEvidenceEnabled();
  const session = await auth();
  if (!session?.user) redirect("/login?next=/cloud/retention");

  const params = await searchParams;
  const orgs = enabled ? await listOrganizations(session.user.id) : [];
  const effectiveOrgId =
    (typeof params.orgId === "string" &&
    orgs.some((o) => o.id === params.orgId)
      ? params.orgId
      : orgs[0]?.id) ?? null;

  const activeOrg = orgs.find((o) => o.id === effectiveOrgId) ?? null;
  const canManage = activeOrg?.role === "owner" || activeOrg?.role === "admin";
  const policy =
    enabled && effectiveOrgId
      ? await getEffectiveRetention(effectiveOrgId)
      : null;

  return (
    <CloudShell enabled={enabled} surfaceLabel="Retention policy">
      <PageHeader
        className="mb-8"
        index="03.3"
        kicker="Cloud · Retention"
        title="Per-organization retention window"
        lede="Each org picks the days an envelope lives in Cloud storage before the sweep deletes it. The default is 180 days. Changing the window affects newly sealed envelopes; existing envelopes keep the expiry stamped when they were stored."
        actions={<PlannedBadge />}
      />

      {!enabled ? (
        <EmptyState
          icon={<FiClock size={20} />}
          title="Retention policy is in development"
          description="The backend, schema, editor, and sweep ship in this build. The UI is not reachable for users until FILEONCHAIN_CLOUD_EVIDENCE_ENABLED is set."
        />
      ) : orgs.length === 0 ? (
        <EmptyState
          icon={<FiClock size={20} />}
          title="No organizations yet"
          description="Retention is org-scoped. Create or join an organization to set a policy."
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
            <h3 className="text-sm font-semibold">Effective window</h3>
            <p className="mt-2 text-sm text-muted">
              Currently{" "}
              <code className="font-mono text-xs text-foreground">
                {policy?.windowDays ?? 180} days
              </code>{" "}
              ({policy?.source === "policy" ? "custom policy" : "default"}).
              The sweep runs daily on Vercel Cron
              (<code className="font-mono text-xs text-foreground">
                /api/cron/retention-sweep
              </code>); ops can also invoke{" "}
              <code className="font-mono text-xs text-foreground">
                scripts/retention-sweep.ts
              </code>{" "}
              manually.
            </p>
            {effectiveOrgId && (
              <RetentionEditor
                orgId={effectiveOrgId}
                initialWindowDays={policy?.windowDays ?? 180}
                canManage={canManage}
              />
            )}
          </Card>
        </div>
      )}
    </CloudShell>
  );
}
