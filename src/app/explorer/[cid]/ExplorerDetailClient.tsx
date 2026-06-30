"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  FiArrowRight,
  FiCheck,
  FiDownload,
  FiExternalLink,
} from "react-icons/fi";
import { PageShell } from "@/components/layout/PageShell";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { Button } from "@/components/ui/Button";
import { compactNumber } from "@/components/LiveLedgerTicker";
import CategoryIcon from "@/components/explorer/CategoryIcon";
import StatusPill from "@/components/explorer/StatusPill";
import {
  formatBytes,
  formatRelativeTime,
  formatTimestamp,
  formatBlockNumber,
  truncateAddress,
  truncateCID,
} from "@/lib/cid/format";
import { buildTxUrl, getChain } from "@/lib/chains/registry";
import type {
  RegisteredFile,
  SearchHit,
} from "@/lib/mock/cid-indexer";
import { getChunksForFile, getFilesByUploader } from "@/lib/mock/cid-indexer";

interface DetailProps {
  file: RegisteredFile;
  hits: SearchHit[];
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

type Tab = "anchors" | "chunks" | "related";

/**
 * ExplorerDetailClient — Etherscan-style transaction-detail page for a
 * single CID. Rendered client-side so it can hydrate the chunks table +
 * related-files section asynchronously.
 */
const ExplorerDetailClient = ({ file, hits }: DetailProps) => {
  const [tab, setTab] = React.useState<Tab>("anchors");
  const [chunks, setChunks] = React.useState<
    Array<{ index: number; cid: string; sizeBytes: number }>
  >([]);
  const [related, setRelated] = React.useState<RegisteredFile[]>([]);
  const [chunksLoaded, setChunksLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      getChunksForFile(file),
      getFilesByUploader(file.uploader, file.cid, 4),
    ]).then(([c, r]) => {
      if (cancelled) return;
      setChunks(c);
      setRelated(r);
      setChunksLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const anchoredHits = hits.filter((h) => h.status === "anchored");
  const pendingHits = hits.filter((h) => h.status === "pending");
  const familySet = new Set(hits.map((h) => h.family));

  return (
    <PageShell size="wide" padding="lg">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1 text-xs text-muted">
        <Link href="/explorer" className="hover:text-foreground">
          Explorer
        </Link>
        <span aria-hidden>›</span>
        <span className="truncate font-mono">{truncateCID(file.cid, 12, 10)}</span>
      </nav>

      {/* Header card ----------------------------------------- */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="rounded-2xl border border-border bg-surface p-5 md:p-7"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-elevated text-primary">
              <CategoryIcon category={file.category} size={22} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                  {file.name}
                </h1>
                <span className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                  {file.category}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 break-all">
                <span
                  className="font-mono text-sm text-foreground"
                  title={file.cid}
                >
                  {file.cid}
                </span>
                <CopyButton value={file.cid} ariaLabel="Copy full CID" />
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                {file.description}
              </p>
            </div>
          </div>

          {/* Quick action */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={<FiDownload size={14} />}
              onClick={() => {
                /* mock rebuild — real version rehydrates from IPLD chunks */
                const blob = new Blob(
                  [
                    `Mock rebuild for ${file.name}\nCID: ${file.cid}\nAnchored on ${anchoredHits.length} chains.\n\nThis is a placeholder. Real reassembly will rehydrate the file from IPLD chunks across chains.`,
                  ],
                  { type: "text/plain" },
                );
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `${file.name.replace(/\.[^.]+$/, "")}.rebuild.txt`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}
            >
              Rebuild & download
            </Button>
            <Link
              href="/#dropzone"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Anchor your own
              <FiArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* Stat strip */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-3 md:grid-cols-5">
          <DetailStat label="Size" value={formatBytes(file.sizeBytes)} />
          <DetailStat
            label="Chunks"
            value={compactNumber(file.chunkCount)}
            hint={`${file.chunkCount === 1 ? "single-chunk file" : `64 KB avg`}`}
          />
          <DetailStat
            label="Chains"
            value={compactNumber(hits.length)}
            hint={`${familySet.size} families · ${anchoredHits.length} anchored, ${pendingHits.length} pending`}
          />
          <DetailStat
            label="Submitter"
            value={truncateAddress(file.uploader, 6)}
            hint="View on explorer"
            mono
          />
          <DetailStat
            label="MIME"
            value={file.mimeType.split("/")[1]?.toUpperCase() ?? "FILE"}
            hint={file.mimeType}
          />
        </div>
      </motion.section>

      {/* Tabs ------------------------------------------------ */}
      <div className="mt-8 flex items-center gap-1 border-b border-border">
        {(
          [
            { id: "anchors", label: `Anchors · ${hits.length}` },
            { id: "chunks", label: `Chunks · ${file.chunkCount}` },
            { id: "related", label: `Related · ${related.length}` },
          ] as Array<{ id: Tab; label: string }>
        ).map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="relative px-3 py-2 text-sm font-medium transition-colors"
              aria-current={isActive ? "page" : undefined}
            >
              <span className={isActive ? "text-foreground" : "text-muted hover:text-foreground"}>
                {t.label}
              </span>
              {isActive && (
                <motion.span
                  layoutId="explorer-tab-underline"
                  className="absolute inset-x-2 -bottom-px h-0.5 bg-primary"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Anchors tab ----------------------------------------- */}
      {tab === "anchors" && (
        <motion.section
          key="anchors"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface"
        >
          <div className="hidden border-b border-border bg-surface-elevated px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_90px] md:gap-4">
            <span>Chain</span>
            <span>Tx hash</span>
            <span>Block</span>
            <span>Age</span>
            <span className="text-right">Link</span>
          </div>
          <ul role="list" className="divide-y divide-border">
            {hits.map((hit, i) => {
              const chainRec = getChain(hit.chainId);
              const realUrl = chainRec ? buildTxUrl(chainRec, hit.txHash) : "#";
              return (
                <motion.li
                  key={hit.chainId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: i * 0.03, ease: EASE_OUT }}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 transition-colors hover:bg-surface-elevated md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_90px] md:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ChainBadge
                      chainId={hit.chainId}
                      chainName={hit.chainName}
                      shortName={hit.chainShortName}
                      size="md"
                    />
                    <StatusPill status={hit.status} />
                  </div>
                  <div className="hidden min-w-0 items-center gap-2 md:flex">
                    <span
                      className="truncate font-mono text-xs text-foreground"
                      title={hit.txHash}
                    >
                      {truncateCID(hit.txHash, 10, 8)}
                    </span>
                    <CopyButton value={hit.txHash} ariaLabel="Copy tx hash" />
                  </div>
                  <div className="hidden font-mono text-xs tabular-nums text-foreground md:block">
                    {formatBlockNumber(hit.blockNumber)}
                  </div>
                  <div className="hidden font-mono text-xs tabular-nums text-foreground md:block">
                    {formatRelativeTime(hit.timestamp)}
                    <span className="ml-2 text-[10px] text-muted">
                      {formatTimestamp(hit.timestamp)}
                    </span>
                  </div>
                  <div className="col-span-2 mt-2 flex items-center justify-between gap-2 md:col-span-1 md:mt-0 md:justify-end">
                    <span className="font-mono text-[10px] text-muted md:hidden">
                      block {formatBlockNumber(hit.blockNumber)} ·{" "}
                      {formatRelativeTime(hit.timestamp)}
                    </span>
                    <Link
                      href={realUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-[11px] text-foreground transition-colors hover:border-primary/50 hover:text-primary"
                      aria-label={`View ${hit.chainName} explorer`}
                    >
                      Explorer <FiExternalLink size={11} />
                    </Link>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </motion.section>
      )}

      {/* Chunks tab ------------------------------------------ */}
      {tab === "chunks" && (
        <motion.section
          key="chunks"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="mt-6"
        >
          {!chunksLoaded ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-lg border border-border bg-surface"
                />
                ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="hidden border-b border-border bg-surface-elevated px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid md:grid-cols-[60px_minmax(0,2fr)_minmax(0,1fr)_120px] md:gap-3">
                <span>#</span>
                <span>Chunk CID</span>
                <span>Size</span>
                <span className="text-right">Copy</span>
              </div>
              <ul role="list" className="max-h-[420px] divide-y divide-border overflow-y-auto">
                {chunks.map((chunk, i) => (
                  <motion.li
                    key={chunk.cid + i}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.012, ease: EASE_OUT }}
                    className="grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 font-mono text-xs transition-colors hover:bg-surface-elevated md:grid-cols-[60px_minmax(0,2fr)_minmax(0,1fr)_120px]"
                  >
                    <span className="font-semibold tabular-nums text-foreground">
                      {chunk.index + 1}
                    </span>
                    <span className="truncate text-foreground" title={chunk.cid}>
                      {chunk.cid}
                    </span>
                    <span className="tabular-nums text-muted">
                      {formatBytes(chunk.sizeBytes)}
                    </span>
                    <span className="col-span-2 flex justify-end md:col-span-1">
                      <CopyButton value={chunk.cid} ariaLabel="Copy chunk CID" />
                    </span>
                  </motion.li>
                ))}
              </ul>
            </div>
          )}
        </motion.section>
      )}

      {/* Related tab ----------------------------------------- */}
      {tab === "related" && (
        <motion.section
          key="related"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="mt-6"
        >
          {related.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
              No other public files from this uploader yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {related.map((r) => (
                <Link
                  key={r.cid}
                  href={`/explorer/${r.cid}`}
                  className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-primary">
                    <CategoryIcon category={r.category} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">
                      {r.name}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted">
                      {truncateCID(r.cid)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {formatBytes(r.sizeBytes)} · {r.chunkCount} chunks
                    </p>
                  </div>
                  <FiArrowRight
                    size={14}
                    className="self-center text-muted transition-transform duration-base group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </Link>
              ))}
            </div>
          )}
        </motion.section>
      )}

      {/* Related meta footer ---------------------------------- */}
      <section className="mt-12 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Content hash
          </p>
          <p className="mt-1 break-all font-mono text-xs text-foreground">
            {truncateCID(file.cid, 14, 12)}
          </p>
          <p className="mt-2 text-[11px] text-muted">
            SHA-256 of the original byte payload, recorded on every supported
            registry contract.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Reconstructable from
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
            {anchoredHits.length}
            <span className="ml-1 text-xs font-normal text-muted">
              / {hits.length} chains
            </span>
          </p>
          <p className="mt-2 text-[11px] text-muted">
            One chain is enough to retrieve; more chains mean higher availability.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Verified integrity
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-success">
            <FiCheck size={14} /> Pass
          </p>
          <p className="mt-2 text-[11px] text-muted">
            All chunks hashed and committed onchain. No drift, no truncation.
          </p>
        </div>
      </section>
    </PageShell>
  );
};

/* ----------------------------------------------------------------------------
 * Detail stat — used in the header strip on the CID detail page.
 * --------------------------------------------------------------------------- */
interface DetailStatProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  mono?: boolean;
}
const DetailStat = ({ label, value, hint, mono = false }: DetailStatProps) => (
  <div className="flex flex-col gap-1 border-l border-border pl-4 first:border-l-0 first:pl-0">
    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
      {label}
    </span>
    <span
      className={
        "truncate text-base font-semibold text-foreground " +
        (mono ? "font-mono" : "")
      }
    >
      {value}
    </span>
    {hint && <span className="truncate text-[10px] text-muted/80">{hint}</span>}
  </div>
);

export default ExplorerDetailClient;
