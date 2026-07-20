import { redirect } from "next/navigation";
import { FiBell } from "react-icons/fi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CloudShell } from "@/components/cloud/CloudShell";
import { PlannedBadge } from "@/components/cloud/PlannedBadge";
import { OrgSelect } from "@/components/cloud/OrgSelect";
import { auth } from "@/lib/auth";
import { listOrganizations } from "@/lib/server/organizations";
import { isCloudWebhooksEnabled } from "@/lib/server/cloud-feature";
import { eq, desc, and } from "drizzle-orm";
import { db, webhookEndpoints, webhookDeliveries, webhookSubscriptions } from "@/lib/db";
import { WebhookEditor } from "@/components/cloud/WebhookEditor";

/**
 * /cloud/webhooks — endpoint list + delivery audit. Server component
 * reads the endpoints and their last 25 deliveries; the editor handles
 * CRUD via /api/v1/webhooks.
 */

interface PageProps {
  searchParams: Promise<{ orgId?: string }>;
}

export default async function CloudWebhooksPage({ searchParams }: PageProps) {
  const enabled = isCloudWebhooksEnabled();
  const session = await auth();
  if (!session?.user) redirect("/login?next=/cloud/webhooks");
  const params = await searchParams;
  const orgs = await listOrganizations(session.user.id);
  const effectiveOrgId =
    (typeof params.orgId === "string" &&
    orgs.some((o) => o.id === params.orgId)
      ? params.orgId
      : orgs[0]?.id) ?? null;

  let endpoints: Array<{
    id: string;
    url: string;
    description: string;
    secretPreview: string;
    disabledAt: string | null;
    createdAt: string;
    events: string[];
  }> = [];
  let deliveries: Array<{
    id: string;
    endpointId: string;
    eventType: string;
    eventId: string;
    attempts: number;
    deliveredAt: string | null;
    lastError: string | null;
    createdAt: string;
  }> = [];

  if (enabled && effectiveOrgId) {
    const rows = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.orgId, effectiveOrgId))
      .orderBy(desc(webhookEndpoints.createdAt));
    const subs = await db
      .select({
        endpointId: webhookSubscriptions.endpointId,
        eventType: webhookSubscriptions.eventType,
      })
      .from(webhookSubscriptions);
    const subsByEndpoint = new Map<string, string[]>();
    for (const s of subs) {
      subsByEndpoint.set(s.endpointId, [
        ...(subsByEndpoint.get(s.endpointId) ?? []),
        s.eventType,
      ]);
    }
    endpoints = rows.map((e) => ({
      id: e.id,
      url: e.url,
      description: e.description,
      secretPreview: e.secretPreview,
      disabledAt: e.disabledAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
      events: subsByEndpoint.get(e.id) ?? [],
    }));
    if (rows.length > 0) {
      const lastDeliveries = await db
        .select({
          id: webhookDeliveries.id,
          endpointId: webhookDeliveries.endpointId,
          eventType: webhookDeliveries.eventType,
          eventId: webhookDeliveries.eventId,
          attempts: webhookDeliveries.attempts,
          deliveredAt: webhookDeliveries.deliveredAt,
          lastError: webhookDeliveries.lastError,
          createdAt: webhookDeliveries.createdAt,
        })
        .from(webhookDeliveries)
        .where(
          and(
            eq(
              webhookDeliveries.endpointId,
              rows[0]!.id,
            ),
          ),
        )
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(25);
      deliveries = lastDeliveries.map((d) => ({
        ...d,
        deliveredAt: d.deliveredAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      }));
    }
  }

  return (
    <CloudShell enabled={enabled} surfaceLabel="Webhooks">
      <PageHeader
        className="mb-8"
        index="03.6"
        kicker="Cloud · Webhooks"
        title="Outbound webhooks"
        lede="Subscribe URLs to envelope and anchor events. Each delivery is signed with HMAC-SHA-256 over `${unix}.${body}` — receivers verify via the X-FileOnChain-Signature header."
        actions={<PlannedBadge />}
      />

      {!enabled ? (
        <EmptyState
          icon={<FiBell size={20} />}
          title="Webhooks are in development"
          description="The backend, routes, and drain ship in this build. Open by setting FILEONCHAIN_CLOUD_WEBHOOKS_ENABLED=1."
        />
      ) : orgs.length === 0 ? (
        <EmptyState
          icon={<FiBell size={20} />}
          title="No organizations yet"
          description="Webhooks are org-scoped. Create or join an organization first."
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
            <h3 className="text-sm font-semibold">Endpoints</h3>
            <p className="mt-2 text-sm text-muted">
              Manage receivers and event subscriptions. The signing
              secret is shown once at creation; rotation re-shows it.
            </p>
            {effectiveOrgId ? (
              <WebhookEditor
                orgId={effectiveOrgId}
                endpoints={endpoints}
              />
            ) : null}
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold">Recent deliveries</h3>
            {deliveries.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No deliveries yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                {deliveries.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
                    <span>
                      <code className="font-mono">{d.eventType}</code>
                      {" · "}
                      <code className="font-mono text-muted">{d.eventId.slice(0, 12)}…</code>
                    </span>
                    <span>
                      attempts {d.attempts}
                      {d.deliveredAt
                        ? ` · delivered ${d.deliveredAt}`
                        : d.lastError
                          ? ` · failed: ${d.lastError.slice(0, 60)}`
                          : " · pending"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </CloudShell>
  );
}
