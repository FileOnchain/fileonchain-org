import Link from "next/link";
import { redirect } from "next/navigation";
import { FiHeart, FiInbox, FiLock } from "react-icons/fi";
import { getChain, type ChainId } from "@fileonchain/sdk";
import { auth } from "@/lib/auth";
import {
  getActiveApiKeyCount,
  getCreditBalance,
  getLinkedWallets,
  getRecentUploadJobs,
  getUploadStats,
} from "@/lib/server/queries";
import RuntimeChip from "@/components/profile/RuntimeChip";
import { formatSize } from "@/lib/format";
import FormattedDate from "@/components/ui/FormattedDate";
import { formatMicroUsdc } from "@/lib/usdc";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CopyButton } from "@/components/ui/CopyButton";
import { ChainBadge } from "@/components/ui/ChainBadge";

/** Ledger-style stat — mono numeral + tracked label, matching the hero's stat row. */
const Stat = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
  <div className="flex min-w-0 flex-col items-start gap-1">
    <span className="truncate font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground md:text-4xl">
      {value}
    </span>
    <span className="truncate text-[11px] font-medium uppercase tracking-wider text-muted">
      {label}
    </span>
    {hint && <span className="truncate text-[10px] text-muted/70">{hint}</span>}
    <span aria-hidden className="mt-2 h-px w-10 bg-primary/40" />
  </div>
);

const STATUS_BADGES: Record<string, { label: string; variant: "success" | "warning" | "danger" | "default" }> = {
  complete: { label: "Anchored", variant: "success" },
  anchoring: { label: "Anchoring", variant: "warning" },
  pending: { label: "Pending", variant: "warning" },
  failed: { label: "Failed", variant: "danger" },
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/dashboard");
  const userId = session.user.id;

  const [balance, stats, keyCount, jobs, linkedWallets] = await Promise.all([
    getCreditBalance(userId),
    getUploadStats(userId),
    getActiveApiKeyCount(userId),
    getRecentUploadJobs(userId),
    getLinkedWallets(userId),
  ]);

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-6 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-4 sm:gap-8">
        <Stat
          label="Credit balance"
          value={formatMicroUsdc(balance)}
          hint="Fund on the Credits tab"
        />
        <Stat label="Files anchored" value={stats.files} hint="Via account uploads" />
        <Stat label="Bytes stored" value={formatSize(stats.bytes)} hint="Across all chains" />
        <Stat label="API keys" value={keyCount} hint="Active keys" />
      </div>

      <Card className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Verified wallets
            </p>
            {linkedWallets.length === 0 ? (
              <p className="mt-1 text-sm text-muted">
                No wallets verified yet — connect a wallet (top right) and sign
                the ownership challenge to link it to this account.
              </p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {linkedWallets.map((wallet) => (
                  <li
                    key={wallet.family}
                    className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5"
                  >
                    <RuntimeChip family={wallet.family} active />
                    <span className="font-mono text-xs text-muted">
                      {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link
            href="/profile"
            className="shrink-0 text-sm text-primary hover:underline"
          >
            Manage on your profile →
          </Link>
        </div>
      </Card>

      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
        Recent uploads
      </h2>
      {jobs.length === 0 ? (
        <EmptyState
          icon={<FiInbox size={20} />}
          title="No account uploads yet"
          description="Anchor a file with credits (or an API key) and it will show up here. Pay-as-you-go uploads signed by your wallet appear on your public profile."
          action={
            <Link href="/">
              <Button>Upload a file</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => {
            const status = STATUS_BADGES[job.status] ?? STATUS_BADGES.pending;
            return (
              <li key={job.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-medium text-foreground">
                          <Link
                            href={`/explorer/${job.cid}`}
                            className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {job.fileName}
                          </Link>
                        </h3>
                        <Badge variant={status.variant} size="sm">
                          {status.label}
                        </Badge>
                        <Badge variant="default" size="sm">
                          {job.paymentMethod === "byok" ? "BYOK" : "Credits"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="break-all font-mono">
                          {job.cid.slice(0, 14)}…{job.cid.slice(-6)}
                        </span>
                        <CopyButton value={job.cid} ariaLabel="Copy CID" />
                        <span>·</span>
                        <span>{formatSize(job.fileSizeBytes)}</span>
                        <span>·</span>
                        <span>{job.chunkCount} chunks</span>
                        <span>·</span>
                        <FormattedDate date={job.createdAt} />
                        <span>·</span>
                        <span>{formatMicroUsdc(job.costMicroUsdc)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {(job.chainIds as ChainId[]).map((chainId) => {
                        const chain = getChain(chainId);
                        return chain ? (
                          <ChainBadge
                            key={chainId}
                            chainId={chain.id}
                            chainName={chain.name}
                            shortName={chain.shortName}
                            size="sm"
                          />
                        ) : null;
                      })}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card variant="outlined">
          <CardHeader>
            <CardTitle>Support your files</CardTitle>
          </CardHeader>
          <CardDescription>
            Donations keep public pinning alive for your CIDs. Top up the platform or pick a chain to back.
          </CardDescription>
          <Link
            href="/donations"
            className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <FiHeart size={14} /> Open donations
          </Link>
        </Card>
        <Card variant="outlined">
          <CardHeader>
            <CardTitle>Manage private cache</CardTitle>
          </CardHeader>
          <CardDescription>
            Buy private encryption tiers, manage grantees, and revoke access.
          </CardDescription>
          <Link
            href="/cache"
            className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <FiLock size={14} /> Open cache
          </Link>
        </Card>
      </div>
    </>
  );
}
