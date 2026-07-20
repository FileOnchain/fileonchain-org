import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, inArray } from "drizzle-orm";
import { FiBox } from "react-icons/fi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CloudShell } from "@/components/cloud/CloudShell";
import { PlannedBadge } from "@/components/cloud/PlannedBadge";
import FormattedDate from "@/components/ui/FormattedDate";
import { auth } from "@/lib/auth";
import { db, evidenceEnvelopes, organizations } from "@/lib/db";
import { listUserOrgIds } from "@/lib/server/evidence";
import { isCloudEvidenceEnabled } from "@/lib/server/cloud-feature";

/**
 * /cloud/verify — list of envelopes the signed-in user can view. Spans
 * every org the user is a member of so they see one index even with
 * multiple workspaces. The flag short-circuits to an EmptyState when the
 * Cloud evidence surface is OFF.
 */

export default async function CloudVerifyListPage() {
  const enabled = isCloudEvidenceEnabled();
  const session = await auth();
  if (!session?.user) redirect("/login?next=/cloud/verify");

  const userOrgIds = await listUserOrgIds(session.user.id);

  let rows: Array<{
    id: string;
    profile: string | null;
    subjectSha256: string | null;
    envelopeDigest: string;
    createdAt: Date;
    orgName: string | null;
  }> = [];

  if (enabled && userOrgIds.length > 0) {
    const envelopes = await db
      .select({
        id: evidenceEnvelopes.id,
        profile: evidenceEnvelopes.profile,
        subjectSha256: evidenceEnvelopes.subjectSha256,
        envelopeDigest: evidenceEnvelopes.envelopeDigest,
        createdAt: evidenceEnvelopes.createdAt,
        orgId: evidenceEnvelopes.orgId,
      })
      .from(evidenceEnvelopes)
      .where(inArray(evidenceEnvelopes.orgId, userOrgIds))
      .orderBy(desc(evidenceEnvelopes.createdAt))
      .limit(50);
    const orgNames = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(inArray(organizations.id, userOrgIds));
    const nameById = new Map(orgNames.map((o) => [o.id, o.name]));
    rows = envelopes.map((e) => ({
      id: e.id,
      profile: e.profile,
      subjectSha256: e.subjectSha256,
      envelopeDigest: e.envelopeDigest,
      createdAt: e.createdAt,
      orgName: nameById.get(e.orgId) ?? null,
    }));
  }

  return (
    <CloudShell enabled={enabled} surfaceLabel="Hosted verification">
      <PageHeader
        className="mb-8"
        index="03.1"
        kicker="Cloud · Hosted verification"
        title="Envelopes you can verify"
        lede="Every envelope sealed into the Cloud gets a shareable URL that runs the open verifier and renders the check report. The local verifier remains the ground truth — these pages are a convenience."
        actions={<PlannedBadge />}
      />

      {!enabled ? (
        <EmptyState
          icon={<FiBox size={20} />}
          title="Hosted verification is in development"
          description="The backend, schema, and pages ship in this build. The routes and UI are not reachable for users until FILEONCHAIN_CLOUD_EVIDENCE_ENABLED is set."
        />
      ) : userOrgIds.length === 0 ? (
        <EmptyState
          icon={<FiBox size={20} />}
          title="No organizations yet"
          description="Hosted verification is org-scoped. Create or join an organization, then mint an org-scoped API key to seal envelopes here."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FiBox size={20} />}
          title="No envelopes yet"
          description="POST a sealed envelope to /api/v1/evidence to see it here."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium">Profile</th>
                <th className="px-4 py-2 font-medium">Org</th>
                <th className="px-4 py-2 font-medium">Sealed</th>
                <th className="px-4 py-2 font-medium sr-only">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-mono text-xs text-foreground">
                    {r.subjectSha256 ? r.subjectSha256.slice(0, 12) + "…" : r.envelopeDigest.slice(0, 12) + "…"}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">
                    {r.profile ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{r.orgName ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted">
                    <FormattedDate date={r.createdAt} />
                  </td>
                  <td className="px-4 py-2 text-right text-xs">
                    <Link
                      href={`/cloud/verify/${r.id}`}
                      className="text-primary underline underline-offset-2"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </CloudShell>
  );
}
