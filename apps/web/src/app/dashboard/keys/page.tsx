import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { FiKey } from "react-icons/fi";
import { auth } from "@/lib/auth";
import { db, apiKeys } from "@/lib/db";
import { formatAgo } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CreateApiKeyButton,
  RevokeApiKeyButton,
} from "@/components/dashboard/ApiKeyActions";

export const metadata: Metadata = { title: "API keys" };

export default async function KeysPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/dashboard/keys");

  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, session.user.id))
    .orderBy(desc(apiKeys.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">
          API keys anchor files programmatically against your credit balance —
          send <code className="font-mono text-xs">Authorization: Bearer fok_…</code>{" "}
          to <code className="font-mono text-xs">POST /api/v1/anchor</code>.
        </p>
        <CreateApiKeyButton />
      </div>

      {keys.length === 0 ? (
        <EmptyState
          icon={<FiKey size={20} />}
          title="No API keys yet"
          description="Create a key to use your account credits from scripts and apps."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {keys.map((key) => {
            const revoked = key.revokedAt !== null;
            return (
              <li
                key={key.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {key.name}
                    </span>
                    <code className="font-mono text-xs text-muted">
                      {key.prefix}…
                    </code>
                    {revoked && (
                      <Badge variant="danger" size="sm">
                        Revoked
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Created {formatAgo(key.createdAt)}
                    {key.lastUsedAt
                      ? ` · last used ${formatAgo(key.lastUsedAt)}`
                      : " · never used"}
                  </p>
                </div>
                {!revoked && <RevokeApiKeyButton keyId={key.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
