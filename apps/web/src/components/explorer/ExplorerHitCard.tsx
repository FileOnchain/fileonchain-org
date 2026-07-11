"use client";

import * as React from "react";
import Link from "next/link";
import { FiExternalLink } from "react-icons/fi";
import { Card } from "@/components/ui/Card";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { buildTxUrl, getChain } from "@fileonchain/sdk";
import { truncateCID, formatTimestamp, formatBlockNumber } from "@/lib/cid/format";
import type { SearchHit } from "@/lib/mock/cid-indexer";

interface ExplorerHitCardProps {
  hit: SearchHit;
  cid: string;
}

const STATUS_VARIANT = {
  anchored: "success",
  pending: "warning",
  failed: "danger",
} as const;

/**
 * ExplorerHitCard — one chain's match for a CID. Shows chain, txHash with
 * explorer link, block, timestamp, and a copy button.
 */
export const ExplorerHitCard = ({ hit, cid }: ExplorerHitCardProps) => {
  const chain = getChain(hit.chainId);
  const txUrl = chain ? buildTxUrl(chain, hit.txHash) : "#";

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ChainBadge
            chainId={hit.chainId}
            chainName={hit.chainName}
            shortName={hit.chainShortName}
          />
          <Badge variant={STATUS_VARIANT[hit.status]} size="sm">
            {hit.status}
          </Badge>
        </div>
        <Link
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Explorer <FiExternalLink />
        </Link>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted">CID</dt>
          <dd className="mt-0.5 flex items-center gap-1 font-mono break-all">
            {truncateCID(cid)}
            <CopyButton value={cid} ariaLabel="Copy CID" />
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted">Tx hash</dt>
          <dd className="mt-0.5 flex items-center gap-1 font-mono break-all">
            {truncateCID(hit.txHash)}
            <CopyButton value={hit.txHash} ariaLabel="Copy tx hash" />
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted">Block</dt>
          <dd className="mt-0.5 font-mono">{formatBlockNumber(hit.blockNumber)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted">Timestamp</dt>
          <dd className="mt-0.5">{formatTimestamp(hit.timestamp)}</dd>
        </div>
      </dl>
    </Card>
  );
};

export default ExplorerHitCard;