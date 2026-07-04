import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FiDollarSign } from "react-icons/fi";
import { auth } from "@/lib/auth";
import { getCreditBalance, getLedgerEntries } from "@/lib/server/queries";
import FormattedDate from "@/components/ui/FormattedDate";
import { formatMicroUsdc } from "@/lib/usdc";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import AddCreditsButton from "@/components/dashboard/AddCreditsButton";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Credits" };

const REASON_LABELS: Record<string, string> = {
  deposit: "Deposit",
  anchor_debit: "Anchor",
  refund: "Refund",
  adjustment: "Adjustment",
};

export default async function CreditsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/dashboard/credits");
  const userId = session.user.id;

  const [balance, ledger] = await Promise.all([
    getCreditBalance(userId),
    getLedgerEntries(userId),
  ]);

  return (
    <div className="space-y-8">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Available balance
            </p>
            <p className="mt-1 font-mono text-4xl font-semibold tabular-nums tracking-tight text-foreground">
              {formatMicroUsdc(balance)}
            </p>
            <p className="mt-1 text-xs text-muted">
              Credits pay for server-side anchoring — no per-chunk wallet
              signatures, usable from the app or your API keys.
            </p>
          </div>
          <AddCreditsButton />
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
          Ledger
        </h2>
        {ledger.length === 0 ? (
          <EmptyState
            icon={<FiDollarSign size={20} />}
            title="No credit activity yet"
            description="Deposits and anchor debits will appear here."
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {ledger.map((entry) => {
              const positive = entry.deltaMicroUsdc > 0n;
              return (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge variant={positive ? "success" : "default"} size="sm">
                      {REASON_LABELS[entry.reason] ?? entry.reason}
                    </Badge>
                    {entry.refId && (
                      <span className="truncate font-mono text-xs text-muted">
                        {entry.refType}:{entry.refId.slice(0, 8)}…
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span
                      className={cn(
                        "font-mono text-sm tabular-nums",
                        positive ? "text-success" : "text-foreground",
                      )}
                    >
                      {positive ? "+" : "−"}
                      {formatMicroUsdc(
                        entry.deltaMicroUsdc < 0n
                          ? -entry.deltaMicroUsdc
                          : entry.deltaMicroUsdc,
                      )}
                    </span>
                    <span className="text-xs text-muted">
                      <FormattedDate date={entry.createdAt} withTime />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
