import type { Metadata } from "next";
import Link from "next/link";
import { FiFileText, FiHeart, FiInbox, FiLock } from "react-icons/fi";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CopyButton } from "@/components/ui/CopyButton";
import { ChainBadge } from "@/components/ui/ChainBadge";
import DonateButton from "@/components/donations/DonateButton";

interface DashboardItem {
  id: string;
  filename: string;
  cid: string;
  chain: string;
  chainShort: string;
  chainId: string;
  sizeBytes: number;
  uploadedAt: number;
  private?: boolean;
}

/* TODO: replace mock data with real reads from the user's uploaded CID list */

const MOCK_ITEMS: DashboardItem[] = [
  {
    id: "u-1",
    filename: "founding-vision.pdf",
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    chain: "Base",
    chainShort: "BASE",
    chainId: "evm:8453",
    sizeBytes: 245_000,
    uploadedAt: Math.floor(Date.now() / 1000) - 86_400 * 3,
  },
  {
    id: "u-2",
    filename: "private-roadmap.pdf",
    cid: "bafybeibv3zaicqsdwfmq5dym6ipxzl5qxksirv3d3uyzjqhs2dtx3w3c3q",
    chain: "Optimism",
    chainShort: "OP",
    chainId: "evm:10",
    sizeBytes: 540_000,
    uploadedAt: Math.floor(Date.now() / 1000) - 86_400 * 12,
    private: true,
  },
  {
    id: "u-3",
    filename: "launch-assets.zip",
    cid: "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
    chain: "Ethereum",
    chainShort: "ETH",
    chainId: "evm:1",
    sizeBytes: 18_400_000,
    uploadedAt: Math.floor(Date.now() / 1000) - 86_400 * 30,
  },
];

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const formatAgo = (ts: number): string => {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
};

const Stat = ({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) => (
  <Card>
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
      </div>
    </div>
  </Card>
);

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your anchored files, private cache, and donation history.",
  // Per-user view — keep it out of the index.
  robots: { index: false, follow: false },
  alternates: { canonical: "/dashboard" },
};

export default function DashboardPage() {
  const total = MOCK_ITEMS.length;
  const totalBytes = MOCK_ITEMS.reduce((sum, item) => sum + item.sizeBytes, 0);
  const privateCount = MOCK_ITEMS.filter((item) => item.private).length;

  return (
    <PageShell size="wide" padding="lg">
      <div className="mb-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Dashboard
        </p>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground">
          Your onchain files
        </h1>
        <p className="text-muted max-w-2xl">
          All files you&apos;ve anchored onchain. Switch chains, manage private cache, or donate back to keep
          the public layer alive.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Stat label="Total files" value={total} icon={<FiFileText size={18} />} />
        <Stat label="Bytes stored" value={formatSize(totalBytes)} icon={<FiInbox size={18} />} />
        <Stat label="Private entries" value={privateCount} icon={<FiLock size={18} />} />
      </div>

      {MOCK_ITEMS.length === 0 ? (
        <EmptyState
          icon={<FiInbox size={20} />}
          title="No files yet"
          description="Drop a file on the upload page to get started."
          action={
            <Link href="/">
              <Button>Upload your first file</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {MOCK_ITEMS.map((item) => (
            <li key={item.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-medium text-foreground truncate">{item.filename}</h3>
                      {item.private && (
                        <Badge variant="private" size="sm">
                          🔒 Private
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted">
                      <span className="font-mono break-all">
                        {item.cid.slice(0, 14)}…{item.cid.slice(-6)}
                      </span>
                      <CopyButton value={item.cid} ariaLabel="Copy CID" />
                      <span>·</span>
                      <span>{formatSize(item.sizeBytes)}</span>
                      <span>·</span>
                      <span>{formatAgo(item.uploadedAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ChainBadge
                      chainId={item.chainId as never}
                      chainName={item.chain}
                      shortName={item.chainShort}
                      size="sm"
                    />
                    <DonateButton cid={item.cid} label="Donate" />
                    <Link
                      href={`/explorer/${item.cid}`}
                      className="inline-flex items-center justify-center h-8 px-3 text-sm rounded-md font-medium text-muted hover:text-foreground hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              </Card>
            </li>
          ))}
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
    </PageShell>
  );
}