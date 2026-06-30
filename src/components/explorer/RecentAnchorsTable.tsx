"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FiArrowRight } from "react-icons/fi";
import CategoryIcon from "@/components/explorer/CategoryIcon";
import StatusPill from "@/components/explorer/StatusPill";
import type { RecentAnchorRow } from "@/lib/mock/cid-indexer";
import {
  formatBytes,
  formatRelativeTime,
  truncateCID,
} from "@/lib/cid/format";
import { buildTxUrl, getChain } from "@/lib/chains/registry";

interface RecentAnchorsTableProps {
  rows: RecentAnchorRow[];
}

/**
 * RecentAnchorsTable — Etherscan-style row list. Each row shows the file
 * (icon + name + CID), the chain count, the latest anchor in plain
 * English ("3s ago · Ethereum"), and a quick "open detail" arrow. Hover
 * highlights the row and reveals an inline chain strip.
 */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const RecentAnchorsTable = ({ rows }: RecentAnchorsTableProps) => {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
        No recent anchors for this filter. Try widening the family or category.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="hidden border-b border-border bg-surface-elevated px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid md:grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_60px] md:gap-4">
        <span>File</span>
        <span>Size · Chunks</span>
        <span>Anchored on</span>
        <span>Latest</span>
        <span className="text-right">Open</span>
      </div>
      <ul role="list" className="divide-y divide-border">
        {rows.map((row, i) => {
          const { file, hits } = row;
          const sortedHits = [...hits].sort((a, b) => b.timestamp - a.timestamp);
          const latest = sortedHits[0];
          const anchoredChain = getChain(latest.chainId);
          const txUrl = anchoredChain
            ? buildTxUrl(anchoredChain, latest.txHash)
            : "#";
          const anchoredAgo = formatRelativeTime(row.anchoredAt);
          return (
            <motion.li
              key={file.cid}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04, ease: EASE_OUT }}
              className="group relative grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated md:grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_60px] md:gap-4"
            >
              {/* Hover highlight bar */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-primary transition-transform duration-base ease-out-soft group-hover:scale-y-100"
              />
              {/* File */}
              <div className="flex min-w-0 items-center gap-3 md:gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-primary">
                  <CategoryIcon category={file.category} size={16} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-foreground">
                      {file.name}
                    </span>
                    <StatusPill status={latest.status} />
                  </div>
                  <Link
                    href={`/explorer/${file.cid}`}
                    className="mt-0.5 block truncate font-mono text-[11px] text-muted hover:text-primary"
                    title={file.cid}
                  >
                    {truncateCID(file.cid, 10, 8)}
                  </Link>
                </div>
              </div>

              {/* Size · chunks (md+) */}
              <div className="hidden text-sm md:block">
                <span className="font-mono tabular-nums text-foreground">
                  {formatBytes(file.sizeBytes)}
                </span>
                <span className="ml-2 text-xs text-muted">
                  · {file.chunkCount} chunks
                </span>
              </div>

              {/* Anchored on — chain strip */}
              <div className="hidden flex-wrap items-center gap-1 md:flex">
                {sortedHits.slice(0, 6).map((h) => (
                  <span
                    key={h.chainId}
                    title={`${h.chainName} · block ${h.blockNumber.toLocaleString()}`}
                    className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                  >
                    {h.chainShortName}
                  </span>
                ))}
                {sortedHits.length > 6 && (
                  <span className="font-mono text-[10px] text-muted">
                    +{sortedHits.length - 6}
                  </span>
                )}
              </div>

              {/* Latest */}
              <div className="hidden text-sm md:block">
                <Link
                  href={txUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono tabular-nums text-foreground hover:text-primary"
                >
                  {anchoredAgo}
                </Link>
                <span className="ml-2 text-xs text-muted">
                  · {anchoredChain?.name ?? "—"}
                </span>
              </div>

              {/* Mobile size */}
              <div className="col-span-2 mt-1 flex items-center gap-2 font-mono text-[11px] text-muted md:hidden">
                <span>{formatBytes(file.sizeBytes)}</span>
                <span>·</span>
                <span>{file.chunkCount} chunks</span>
                <span>·</span>
                <span>{anchoredAgo}</span>
              </div>

              {/* Open */}
              <Link
                href={`/explorer/${file.cid}`}
                aria-label={`Open ${file.name}`}
                className="col-span-1 row-span-2 hidden h-8 w-8 items-center justify-center self-center justify-self-end rounded-full border border-border text-foreground transition-all duration-base ease-out-soft group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground md:row-span-1 md:flex"
              >
                <FiArrowRight
                  size={14}
                  className="transition-transform duration-base group-hover:translate-x-0.5"
                />
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
};

export default RecentAnchorsTable;
