"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { FiArrowRight } from "react-icons/fi";
import StatusPill from "@/components/explorer/StatusPill";
import { ChainBadge } from "@/components/ui/ChainBadge";
import type { RecentAnchorRow, SearchHit } from "@/lib/mock/cid-indexer";
import {
  formatRelativeTime,
  formatTimestamp,
  truncateAddress,
  truncateCID,
} from "@/lib/cid/format";
import { buildTxUrl, getChain } from "@fileonchain/sdk";

/**
 * Collapse a CID's per-event hits into one representative hit per chain.
 * The indexer writes one event per log, so a CID anchored twice on the
 * same chain produces two hits with the same `chainId` — the explorer
 * "Anchored on" strip should show each chain once. We keep the first hit
 * per chain (its metadata — name / shortName / status — is identical for
 * every hit of the same chainId).
 */
const dedupeHitsByChain = (hits: SearchHit[]): SearchHit[] => {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.chainId)) continue;
    seen.add(hit.chainId);
    out.push(hit);
  }
  return out;
};

/** Rich per-chain tooltip — chain name, absolute time, block, tx hash preview. */
const chainBadgeTitle = (h: SearchHit): string =>
  [
    h.chainName,
    formatTimestamp(h.timestamp),
    `block ${h.blockNumber.toLocaleString()}`,
    `tx ${h.txHash.slice(0, 10)}…${h.txHash.slice(-6)}`,
  ].join("\n");

interface RecentAnchorsTableProps {
  rows: RecentAnchorRow[];
}

/**
 * RecentAnchorsTable — Etherscan-style row list. Each row surfaces:
 *   - the truncated CID + a status pill (anchored / pending / failed),
 *   - the submitter address + a short anchor/chain count beneath it,
 *   - one ChainBadge per distinct chain (logo + name) in the middle,
 *   - the latest relative age + the truncated tx hash linking to the chain
 *     explorer at the right.
 * Hover any time, chain, or tx hash to see the absolute timestamp or
 * per-chain details (the table is dense by design — the indexer carries
 * no off-chain file metadata, so "more" lives in tooltips and the detail
 * page rather than on the row).
 */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const RecentAnchorsTable = ({ rows }: RecentAnchorsTableProps) => {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
        No recent anchors for this combination. Try a different runtime.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="hidden border-b border-border bg-surface-elevated px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.4fr)_60px] md:gap-4">
        <span>CID</span>
        <span>Anchored on</span>
        <span>Latest</span>
        <span className="text-right">Open</span>
      </div>
      <ul role="list" className="divide-y divide-border">
        {rows.map((row, i) => {
          const { cid, hits } = row;
          const sortedHits = [...hits].sort((a, b) => b.timestamp - a.timestamp);
          const latest = sortedHits[0];
          const anchoredChain = getChain(latest.chainId);
          const txUrl = anchoredChain
            ? buildTxUrl(anchoredChain, latest.txHash)
            : "#";
          const anchoredAgo = formatRelativeTime(row.anchoredAt);
          const dedupedChains = dedupeHitsByChain(sortedHits);
          const totalAnchors = sortedHits.length;
          const chainCount = dedupedChains.length;
          // Submitters are case-insensitive (EVM addresses lowercase, but be
          // defensive — Solana / Sui addresses can differ in case).
          const uniqueSubmitters = new Set(
            sortedHits.map((h) => h.submitter.toLowerCase()),
          );
          const singleSubmitter = uniqueSubmitters.size === 1;
          const submitter = latest.submitter;
          return (
            <motion.li
              key={cid}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04, ease: EASE_OUT }}
              className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.4fr)_60px] md:gap-4"
            >
              {/* Hover highlight bar */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-primary transition-transform duration-base ease-out-soft group-hover:scale-y-100"
              />
              {/* CID + submitter + counts */}
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/explorer/${cid}`}
                      className="truncate font-mono font-semibold text-foreground hover:text-primary"
                      title={cid}
                    >
                      {truncateCID(cid, 14, 10)}
                    </Link>
                    <StatusPill status={latest.status} />
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                    by{" "}
                    {singleSubmitter ? (
                      <Link
                        href={`/profile/${submitter}`}
                        className="text-foreground/80 hover:text-primary"
                        title={submitter}
                      >
                        {truncateAddress(submitter, 5)}
                      </Link>
                    ) : (
                      <span title={`${uniqueSubmitters.size} distinct addresses`}>
                        {uniqueSubmitters.size} submitters
                      </span>
                    )}
                    <span className="mx-1.5 text-muted/60">·</span>
                    {totalAnchors} anchor{totalAnchors === 1 ? "" : "s"}
                    <span className="mx-1.5 text-muted/60">·</span>
                    {chainCount} chain{chainCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              {/* Anchored on — one badge per distinct chain, rich tooltip */}
              <div className="hidden flex-wrap items-center gap-1.5 md:flex">
                {dedupedChains.slice(0, 4).map((h) => (
                  <ChainBadge
                    key={h.chainId}
                    chainId={h.chainId}
                    chainName={h.chainName}
                    shortName={h.chainShortName}
                    size="sm"
                  />
                ))}
                {dedupedChains.length > 4 && (
                  <span className="font-mono text-[10px] text-muted">
                    +{dedupedChains.length - 4}
                  </span>
                )}
                {/* Per-chain tooltips live on a hidden overlay so the
                    ChainBadge stays clickable but still surfaces the
                    absolute time + tx hash on hover. */}
                <span className="sr-only">
                  {dedupedChains.map((h) => (
                    <span key={`tip-${h.chainId}`} title={chainBadgeTitle(h)}>
                      {h.chainName}
                    </span>
                  ))}
                </span>
              </div>

              {/* Latest — relative time + tx hash preview */}
              <div className="hidden md:block">
                <Link
                  href={txUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono tabular-nums text-sm text-foreground hover:text-primary"
                  title={`${formatTimestamp(latest.timestamp)} · block ${latest.blockNumber.toLocaleString()}`}
                >
                  {anchoredAgo}
                </Link>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                  <Link
                    href={txUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary"
                    title={latest.txHash}
                  >
                    {truncateCID(latest.txHash, 8, 6)}
                  </Link>
                  <span className="mx-1.5 text-muted/60">·</span>
                  <span title={formatTimestamp(latest.timestamp)}>
                    block {latest.blockNumber.toLocaleString()}
                  </span>
                </p>
              </div>

              {/* Mobile row */}
              <div className="col-span-2 mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted md:hidden">
                <Link
                  href={txUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:text-primary"
                  title={formatTimestamp(latest.timestamp)}
                >
                  {anchoredAgo}
                </Link>
                <span>·</span>
                <Link
                  href={`/profile/${submitter}`}
                  className="hover:text-primary"
                  title={submitter}
                >
                  {truncateAddress(submitter, 4)}
                </Link>
                <span>·</span>
                <span>{latest.chainShortName}</span>
                {chainCount > 1 && (
                  <>
                    <span>·</span>
                    <span>+{chainCount - 1} more</span>
                  </>
                )}
              </div>

              {/* Open */}
              <Link
                href={`/explorer/${cid}`}
                aria-label={`Open ${truncateCID(cid, 8, 6)}`}
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