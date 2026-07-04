import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq, isNull, and } from "drizzle-orm";
import { FiShield } from "react-icons/fi";
import { auth } from "@/lib/auth";
import { db, byokKeys } from "@/lib/db";
import FormattedDate from "@/components/ui/FormattedDate";
import { getByokProvider } from "@/lib/byok/providers";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AddByokKeyButton,
  ByokRowActions,
} from "@/components/dashboard/ByokActions";

export const metadata: Metadata = { title: "Bring your own keys" };

const STATUS_BADGES: Record<string, { label: string; variant: BadgeVariant }> = {
  valid: { label: "Valid", variant: "success" },
  invalid: { label: "Invalid", variant: "danger" },
  unverified: { label: "Unverified", variant: "warning" },
};

export default async function ByokPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/dashboard/byok");

  const keys = await db
    .select()
    .from(byokKeys)
    .where(and(eq(byokKeys.userId, session.user.id), isNull(byokKeys.revokedAt)))
    .orderBy(desc(byokKeys.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">
          Some networks have their own API-key upload systems. Store a key you
          already hold and uploads to that network spend your provider credit
          — no FileOnChain credits needed.
        </p>
        <AddByokKeyButton />
      </div>

      {keys.length === 0 ? (
        <EmptyState
          icon={<FiShield size={20} />}
          title="No provider keys"
          description="Add an Autonomys Auto Drive API key to route Autonomys uploads through your own account."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {keys.map((key) => {
            const provider = getByokProvider(key.provider);
            const status = STATUS_BADGES[key.status] ?? STATUS_BADGES.unverified;
            return (
              <li
                key={key.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {provider?.name ?? key.provider}
                    </span>
                    <span className="text-xs text-muted">{key.label}</span>
                    <code className="font-mono text-xs text-muted">
                      ····{key.keyPreview}
                    </code>
                    <Badge variant={status.variant} size="sm">
                      {status.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Added <FormattedDate date={key.createdAt} />
                    {key.lastValidatedAt
                      ? <> · validated <FormattedDate date={key.lastValidatedAt} /></>
                      : ""}
                  </p>
                </div>
                <ByokRowActions keyId={key.id} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
