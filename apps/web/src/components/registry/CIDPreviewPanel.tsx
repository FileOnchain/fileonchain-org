import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { Badge } from "@/components/ui/Badge";

export interface CIDPreviewData {
  cid: string;
  chainId: string;
  chainName: string;
  chainShortName: string;
  registryAddress: `0x${string}`;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  submitter?: string;
  explorerUrl: string;
  explorerTxPath: string;
  explorerAddressPath: string;
  status?: "anchored" | "pending" | "failed";
}

interface CIDPreviewPanelProps {
  data: CIDPreviewData | null;
}

/**
 * CIDPreviewPanel — shows registry + tx + block metadata for an uploaded file.
 * Rendered inside the upload flow and on `/explorer/[cid]`. When `data` is
 * null, shows a neutral placeholder. (Phase 9 wires up the data source; this
 * UI is ready for it.)
 */
const CIDPreviewPanel = ({ data }: CIDPreviewPanelProps) => {
  if (!data) {
    return (
      <Card variant="outlined" padding="md" className="border-dashed">
        <CardHeader>
          <CardTitle>Registry anchor</CardTitle>
          <Badge variant="outline">Pending upload</Badge>
        </CardHeader>
        <CardDescription>
          Contract address and on-chain tx hash will appear here after the file is anchored.
        </CardDescription>
      </Card>
    );
  }

  const txUrl = `${data.explorerUrl}${data.explorerTxPath}${data.txHash}`;
  const registryUrl = `${data.explorerUrl}${data.explorerAddressPath}${data.registryAddress}`;
  const statusVariant =
    data.status === "anchored"
      ? "success"
      : data.status === "pending"
        ? "warning"
        : "danger";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Registry anchor</CardTitle>
          <Badge variant={statusVariant} size="sm">
            {data.status ?? "anchored"}
          </Badge>
        </div>
        <ChainBadge chainId={data.chainId} chainName={data.chainName} shortName={data.chainShortName} />
      </CardHeader>

      <dl className="grid gap-3 sm:grid-cols-2 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Contract</dt>
          <dd className="mt-1 flex items-center gap-1 font-mono break-all">
            <Link href={registryUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {data.registryAddress}
            </Link>
            <CopyButton value={data.registryAddress} ariaLabel="Copy contract address" />
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Transaction</dt>
          <dd className="mt-1 flex items-center gap-1 font-mono break-all">
            <Link href={txUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {data.txHash.slice(0, 10)}…{data.txHash.slice(-6)}
            </Link>
            <CopyButton value={data.txHash} ariaLabel="Copy tx hash" />
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Block</dt>
          <dd className="mt-1 font-mono">{data.blockNumber.toLocaleString()}</dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Timestamp</dt>
          <dd className="mt-1">{new Date(data.timestamp * 1000).toLocaleString()}</dd>
        </div>

        {data.submitter && (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-muted">Submitter</dt>
            <dd className="mt-1 font-mono break-all">{data.submitter}</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center h-8 px-3 text-sm rounded-md font-medium border border-border bg-surface text-foreground hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          View on explorer
        </Link>
        <Link
          href={`/explorer/${data.cid}`}
          className="inline-flex items-center justify-center h-8 px-3 text-sm rounded-md font-medium text-muted hover:text-foreground hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Open in explorer →
        </Link>
      </div>
    </Card>
  );
};

export default CIDPreviewPanel;