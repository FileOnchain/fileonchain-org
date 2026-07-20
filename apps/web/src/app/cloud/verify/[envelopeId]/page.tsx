import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { FiBox } from "react-icons/fi";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { CloudShell } from "@/components/cloud/CloudShell";
import { PlannedBadge } from "@/components/cloud/PlannedBadge";
import { VerifyReportPanel } from "@/components/cloud/verify/VerifyReportPanel";
import { auth } from "@/lib/auth";
import {
  getEnvelopeRecordById,
  listUserOrgIds,
} from "@/lib/server/evidence";
import { isCloudEvidenceEnabled } from "@/lib/server/cloud-feature";

/**
 * /cloud/verify/[envelopeId] — the hosted verification page. Server
 * component: looks up the envelope by id (404 if missing), enforces user
 * membership in the envelope's org (no info leak across orgs), and hands
 * the canonical envelope JSON to the client `VerifyReportPanel`. The
 * panel runs `@fileonchain/verify` on mount via `useEffect`; the server
 * renders the initial state (subject file input + Re-verify button) and
 * the client takes over on hydration.
 *
 * The page is `noindex` — hosted verification URLs are public but they
 * are not meant to be discovered via search. That matches the "IDs are
 * public URLs, not secrets" wording in `docs/product/fileonchain-cloud.md`.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ envelopeId: string }>;
}): Promise<Metadata> {
  const { envelopeId } = await params;
  return {
    title: `Hosted verification · ${envelopeId.slice(0, 8)}…`,
    description: "Open-verifier check report for a sealed envelope.",
    robots: { index: false, follow: false },
  };
}

export default async function HostedVerifyPage({
  params,
}: {
  params: Promise<{ envelopeId: string }>;
}) {
  const enabled = isCloudEvidenceEnabled();
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { envelopeId } = await params;

  if (!enabled) {
    return (
      <CloudShell enabled={enabled} surfaceLabel="Hosted verification">
        <PageHeader
          className="mb-8"
          index="03.2"
          kicker="Cloud · Hosted verification"
          title="Hosted verification is in development"
          lede="The backend, schema, and pages ship in this build. The routes and UI are not reachable for users until FILEONCHAIN_CLOUD_EVIDENCE_ENABLED is set."
          actions={<PlannedBadge />}
        />
        <EmptyState
          icon={<FiBox size={20} />}
          title="This URL is closed"
          description="Try again after the Cloud evidence surface is enabled."
        />
      </CloudShell>
    );
  }

  const userOrgIds = await listUserOrgIds(session.user.id);
  if (userOrgIds.length === 0) notFound();

  const row = await getEnvelopeRecordById(envelopeId, userOrgIds);
  if (!row) notFound();

  return (
    <CloudShell enabled={enabled} surfaceLabel="Hosted verification">
      <PageHeader
        className="mb-8"
        index="03.2"
        kicker="Cloud · Hosted verification"
        title={`Envelope ${envelopeId.slice(0, 8)}…`}
        lede="This page runs the open verifier over the envelope stored in the Cloud. The chip wording and the grouped sections are the same as /verify — paste the envelope there too and you'll see the same report."
        actions={<PlannedBadge />}
      />
      <VerifyReportPanel
        envelope={row.envelope as Parameters<typeof VerifyReportPanel>[0]["envelope"]}
        envelopeDigest={row.envelopeDigest}
        subjectSha256={row.subjectSha256}
        createdAt={row.createdAt.toISOString()}
      />
    </CloudShell>
  );
}
