import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FiActivity } from "react-icons/fi";
import { auth } from "@/lib/auth";
import { getRecentActivity } from "@/lib/server/queries";
import FormattedDate from "@/components/ui/FormattedDate";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ActivityType } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Activity logs" };

const TYPE_LABELS: Record<ActivityType, { label: string; variant: BadgeVariant }> = {
  sign_in: { label: "Sign in", variant: "info" },
  wallet_linked: { label: "Wallet linked", variant: "primary" },
  wallet_unlinked: { label: "Wallet unlinked", variant: "default" },
  credit_deposit: { label: "Deposit", variant: "success" },
  credit_debit: { label: "Debit", variant: "default" },
  upload_anchor: { label: "Anchor", variant: "accent" },
  api_call: { label: "API call", variant: "outline" },
  api_key_created: { label: "API key created", variant: "primary" },
  api_key_revoked: { label: "API key revoked", variant: "warning" },
  byok_added: { label: "BYOK added", variant: "primary" },
  byok_removed: { label: "BYOK removed", variant: "default" },
  rpc_endpoint_updated: { label: "Custom RPC saved", variant: "primary" },
  rpc_endpoint_removed: { label: "Custom RPC removed", variant: "default" },
  preferences_updated: { label: "Preferences updated", variant: "default" },
  org_created: { label: "Org created", variant: "primary" },
  org_renamed: { label: "Org renamed", variant: "default" },
  org_deleted: { label: "Org deleted", variant: "warning" },
  org_member_added: { label: "Org member added", variant: "primary" },
  org_member_removed: { label: "Org member removed", variant: "default" },
  evidence_sealed: { label: "Evidence sealed", variant: "primary" },
  agent_run_sealed: { label: "Agent run sealed", variant: "primary" },
  evidence_verified: { label: "Evidence verified", variant: "info" },
  evidence_server_signed: { label: "Evidence server-signed", variant: "primary" },
  retention_updated: { label: "Retention updated", variant: "default" },
  cloud_signer_generated: { label: "Cloud signer generated", variant: "primary" },
  cloud_signer_revoked: { label: "Cloud signer revoked", variant: "warning" },
  project_created: { label: "Project created", variant: "primary" },
  project_renamed: { label: "Project renamed", variant: "default" },
  project_deleted: { label: "Project deleted", variant: "warning" },
  project_member_added: { label: "Project member added", variant: "primary" },
  project_member_removed: { label: "Project member removed", variant: "default" },
  project_quotas_updated: { label: "Project quotas updated", variant: "default" },
  webhook_created: { label: "Webhook created", variant: "primary" },
  webhook_updated: { label: "Webhook updated", variant: "default" },
  webhook_revoked: { label: "Webhook revoked", variant: "warning" },
  webhook_secret_rotated: { label: "Webhook secret rotated", variant: "default" },
  webhook_delivery_failed: { label: "Webhook delivery failed", variant: "warning" },
  export_requested: { label: "Export requested", variant: "accent" },
  export_completed: { label: "Export ready", variant: "success" },
  export_downloaded: { label: "Export downloaded", variant: "default" },
  compliance_report_generated: { label: "Compliance report generated", variant: "primary" },
  compliance_report_downloaded: { label: "Compliance report downloaded", variant: "default" },
  sla_tier_changed: { label: "SLA tier changed", variant: "default" },
  deposit_auto_confirmed: { label: "Deposit auto-confirmed", variant: "success" },
  deposit_confirm_failed: { label: "Deposit confirm failed", variant: "warning" },
};

export default async function LogsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/dashboard/logs");

  const logs = await getRecentActivity(session.user.id);

  if (logs.length === 0) {
    return (
      <EmptyState
        icon={<FiActivity size={20} />}
        title="No activity yet"
        description="Sign-ins, uploads, credit events, and API calls will appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {logs.map((log) => {
        const type = TYPE_LABELS[log.type] ?? {
          label: log.type,
          variant: "default" as BadgeVariant,
        };
        const details = Object.entries(log.metadata ?? {}).filter(
          ([, value]) => value !== null && value !== "",
        );
        return (
          <li key={log.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <Badge variant={type.variant} size="sm">
                {type.label}
              </Badge>
              {details.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  {details.map(([key, value]) => (
                    <span key={key} className="truncate">
                      <span className="text-muted/70">{key}:</span>{" "}
                      <span className="font-mono">{String(value)}</span>
                    </span>
                  ))}
                </p>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted">
              <FormattedDate date={log.createdAt} withTime />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
