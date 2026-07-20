import { redirect } from "next/navigation";
import { FiCheckCircle } from "react-icons/fi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CloudShell } from "@/components/cloud/CloudShell";
import { PlannedBadge } from "@/components/cloud/PlannedBadge";
import { OrgSelect } from "@/components/cloud/OrgSelect";
import { auth } from "@/lib/auth";
import { listOrganizations } from "@/lib/server/organizations";
import {
  getOrgSla,
  listComplianceReports,
} from "@/lib/server/compliance";
import { isCloudComplianceEnabled } from "@/lib/server/cloud-feature";
import { ComplianceViewer } from "@/components/cloud/ComplianceViewer";

interface PageProps {
  searchParams: Promise<{ orgId?: string }>;
}

export default async function CloudCompliancePage({ searchParams }: PageProps) {
  const enabled = isCloudComplianceEnabled();
  const session = await auth();
  if (!session?.user) redirect("/login?next=/cloud/compliance");
  const params = await searchParams;
  const orgs = await listOrganizations(session.user.id);
  const effectiveOrgId =
    (typeof params.orgId === "string" &&
    orgs.some((o) => o.id === params.orgId)
      ? params.orgId
      : orgs[0]?.id) ?? null;
  const sla = enabled && effectiveOrgId ? await getOrgSla(effectiveOrgId) : null;
  const reports = enabled && effectiveOrgId
    ? await listComplianceReports(effectiveOrgId, { limit: 24 })
    : [];

  return (
    <CloudShell enabled={enabled} surfaceLabel="Compliance + SLA">
      <PageHeader
        className="mb-8"
        index="03.8"
        kicker="Cloud · Compliance"
        title="Compliance reports & SLAs"
        lede="Monthly signed summaries of an org's evidence activity, plus tier-based uptime and settlement-latency promises."
        actions={<PlannedBadge />}
      />

      {!enabled ? (
        <EmptyState
          icon={<FiCheckCircle size={20} />}
          title="Compliance is in development"
          description="The backend, schema, and pages ship in this build. Open by setting FILEONCHAIN_CLOUD_COMPLIANCE_ENABLED=1."
        />
      ) : orgs.length === 0 ? (
        <EmptyState
          icon={<FiCheckCircle size={20} />}
          title="No organizations yet"
          description="Compliance reports are org-scoped. Create or join an organization first."
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
          {sla && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold">Service level</h3>
              <p className="mt-2 text-sm text-muted">
                Tier <code className="font-mono">{sla.tier}</code>.{" "}
                {sla.monthlyEnvelopesLimit != null &&
                  `Monthly envelopes cap ${sla.monthlyEnvelopesLimit}. `}
                {sla.monthlyAnchorsLimit != null &&
                  `Monthly anchor cap ${sla.monthlyAnchorsLimit}. `}
                Uptime target{" "}
                <code className="font-mono">
                  {(sla.monthlyUptimePct / 100).toFixed(2)}%
                </code>
                . Settlement p95 target{" "}
                <code className="font-mono">{sla.settlementLatencyP95Ms} ms</code>.
              </p>
            </Card>
          )}
          <Card className="p-5">
            <h3 className="text-sm font-semibold">Reports</h3>
            <ComplianceViewer
              orgId={effectiveOrgId}
              reports={reports.map((r) => ({
                id: r.id,
                periodStart: r.periodStart.toISOString(),
                periodEnd: r.periodEnd.toISOString(),
                generatedAt: r.generatedAt.toISOString(),
                envelopeDigest: r.envelopeDigest,
              }))}
            />
          </Card>
        </div>
      )}
    </CloudShell>
  );
}
