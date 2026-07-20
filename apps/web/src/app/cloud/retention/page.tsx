import { redirect } from "next/navigation";
import { FiClock } from "react-icons/fi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CloudShell } from "@/components/cloud/CloudShell";
import { PlannedBadge } from "@/components/cloud/PlannedBadge";
import { auth } from "@/lib/auth";
import { getEffectiveRetention } from "@/lib/server/retention";
import { listUserOrgIds } from "@/lib/server/evidence";
import { isCloudEvidenceEnabled } from "@/lib/server/cloud-feature";

/**
 * /cloud/retention — per-org retention editor. Server component. The
 * effective window is read so the displayed number is real, even though
 * the editor itself is inert (the wire-up is a follow-up; this PR
 * exposes the underlying `getEffectiveRetention` + `setRetentionPolicy`
 * services via the `/api/v1/retention` PATCH endpoint). Honest labeling
 * is the project's signature — we never ship a widget that pretends to
 * work and silently drops the user's input.
 */

export default async function CloudRetentionPage() {
  const enabled = isCloudEvidenceEnabled();
  const session = await auth();
  if (!session?.user) redirect("/login?next=/cloud/retention");

  const userOrgIds = enabled ? await listUserOrgIds(session.user.id) : [];

  let policy: Awaited<ReturnType<typeof getEffectiveRetention>> | null = null;
  if (enabled && userOrgIds.length > 0) {
    policy = await getEffectiveRetention(userOrgIds[0]!);
  }

  return (
    <CloudShell enabled={enabled} surfaceLabel="Retention policy">
      <PageHeader
        className="mb-8"
        index="03.3"
        kicker="Cloud · Retention"
        title="Per-organization retention window"
        lede="Each org picks the days an envelope lives in Cloud storage before the sweep deletes it. The default is 180 days; the editor below is wired but the surface is not reachable for users until FILEONCHAIN_CLOUD_EVIDENCE_ENABLED is set."
        actions={<PlannedBadge />}
      />

      {!enabled ? (
        <EmptyState
          icon={<FiClock size={20} />}
          title="Retention policy is in development"
          description="The backend, schema, and PATCH /api/v1/retention ship in this build. The UI editor and the route are not reachable for users until the flag is on."
        />
      ) : userOrgIds.length === 0 ? (
        <EmptyState
          icon={<FiClock size={20} />}
          title="No organizations yet"
          description="Retention is org-scoped. Create or join an organization to set a policy."
        />
      ) : (
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Effective window</h3>
          <p className="mt-2 text-sm text-muted">
            Currently{" "}
            <code className="font-mono text-xs text-foreground">
              {policy?.windowDays ?? 180} days
            </code>{" "}
            ({policy?.source === "policy" ? "custom policy" : "default"}).
            The sweep entry point lives at{" "}
            <code className="font-mono text-xs text-foreground">
              scripts/retention-sweep.ts
            </code>{" "}
            and is wired for ops to invoke — no cron, no scheduled task.
          </p>
          <fieldset disabled className="mt-4 space-y-2">
            <label
              htmlFor="retention-window"
              className="text-sm font-medium text-foreground"
            >
              Window (days)
            </label>
            <input
              id="retention-window"
              type="number"
              min={1}
              defaultValue={policy?.windowDays ?? 180}
              className="block w-32 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground disabled:opacity-50"
            />
            <p className="text-xs text-muted">
              The editor is inert in this build; the API contract is at
              <code className="font-mono text-[11px]"> PATCH /api/v1/retention</code>.
            </p>
          </fieldset>
        </Card>
      )}
    </CloudShell>
  );
}
