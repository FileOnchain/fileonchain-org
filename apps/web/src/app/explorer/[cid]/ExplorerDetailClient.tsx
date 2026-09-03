"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  FiAlertTriangle,
  FiArrowRight,
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiDownload,
  FiExternalLink,
} from "react-icons/fi";
import { PageShell } from "@/components/layout/PageShell";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { Button } from "@/components/ui/Button";
import { InlineLoader } from "@/components/ui/InlineLoader";
import JsonCode from "@/components/ui/JsonCode";
import { compactNumber } from "@/components/LiveLedgerTicker";
import StatusPill from "@/components/explorer/StatusPill";
import {
  formatRelativeTime,
  formatTimestamp,
  formatBlockNumber,
  truncateAddress,
  truncateCID,
} from "@/lib/cid/format";
import { base64ToBytes, buildTxUrl, getChain } from "@fileonchain/sdk";
import type { SearchHit } from "@/lib/mock/cid-indexer";
import type { ChunkPayloadRow, ChunkRow } from "@/lib/indexer/queries";

/** How a related CID connects to the one on this page. */
export type RelationKind = "parent-file" | "same-submitter";

export interface RelatedEntry {
  cid: string;
  relation: RelationKind;
  hits: SearchHit[];
}

interface DetailProps {
  cid: string;
  hits: SearchHit[];
  initialChunks: ChunkRow[];
  initialRelated: RelatedEntry[];
}

const RELATION_LABEL: Record<RelationKind, string> = {
  "parent-file": "parent file",
  "same-submitter": "same submitter",
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

type Tab = "anchors" | "chunks" | "related";

/* ----------------------------------------------------------------------------
 * Chunk content — fetch state + preview helpers.
 * --------------------------------------------------------------------------- */

type ChunkContent = ChunkPayloadRow & {
  hasData: boolean;
  sizeBytes: number;
  verified: boolean;
};

type ChunkFetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; content: ChunkContent };

const utf8OrNull = (bytes: Uint8Array): string | null => {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Control characters (besides whitespace) mean "render as hex, not text".
    // eslint-disable-next-line no-control-regex
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) ? null : text;
  } catch {
    return null;
  }
};

const looksLikeSvg = (text: string): boolean =>
  /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text);

const HEX_DUMP_MAX = 512;

const hexDump = (bytes: Uint8Array): string => {
  const shown = bytes.slice(0, HEX_DUMP_MAX);
  const lines: string[] = [];
  for (let offset = 0; offset < shown.length; offset += 16) {
    const row = shown.slice(offset, offset + 16);
    const hex = Array.from(row, (b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = Array.from(row, (b) =>
      b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".",
    ).join("");
    lines.push(
      `${offset.toString(16).padStart(6, "0")}  ${hex.padEnd(47)}  ${ascii}`,
    );
  }
  if (bytes.length > HEX_DUMP_MAX) {
    lines.push(`… ${bytes.length - HEX_DUMP_MAX} more bytes`);
  }
  return lines.join("\n");
};

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const fetchChunkContent = async (
  chunkCid: string,
  fileCid: string,
): Promise<ChunkContent> => {
  const res = await fetch(
    `/api/v1/explorer/chunk/${encodeURIComponent(chunkCid)}?file=${encodeURIComponent(fileCid)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `request failed (${res.status})`);
  }
  return (await res.json()) as ChunkContent;
};

/**
 * ExplorerDetailClient — Etherscan-style transaction-detail page for a
 * single CID. Rendered client-side so it can hydrate the chunks table +
 * related-files section asynchronously.
 *
 * The detail page no longer carries off-chain file metadata (name,
 * MIME, description, chunkCount) — the protocol doesn't attest to any
 * of that, so the UI renders only what the indexer can prove: the CID
 * itself, the per-chain anchor hits, the chunk rows derived from
 * on-chain `chunk` events, and other CIDs from the same submitter.
 */
const ExplorerDetailClient = ({ cid, hits, initialChunks, initialRelated }: DetailProps) => {
  const [tab, setTab] = React.useState<Tab>("anchors");
  const chunks = initialChunks;
  const related = initialRelated;
  const chunksLoaded = true;

  const pendingHits = hits.filter((h) => h.status === "pending");
  const chunksWithData = chunks.filter((c) => c.hasData).length;
  const embeddedBytes = chunks.reduce((n, c) => n + c.sizeBytes, 0);
  const allChunksEmbedBytes = chunks.length > 0 && chunksWithData === chunks.length;
  const runtimeSet = new Set(hits.map((h) => h.family));
  const uniqueSubmitters = new Set(hits.map((h) => h.submitter));
  const submitter = hits[0]?.submitter;
  // Distinct chains ≠ anchor rows: re-anchoring on the same chain adds
  // a row, not a chain. Every count below derives from the hits alone.
  const chainIdSet = new Set(hits.map((h) => h.chainId));
  const chainShortNames = Array.from(new Set(hits.map((h) => h.chainShortName)));
  const firstAnchoredAt =
    hits.length > 0 ? Math.min(...hits.map((h) => h.timestamp)) : null;
  const latestAnchoredAt =
    hits.length > 0 ? Math.max(...hits.map((h) => h.timestamp)) : null;

  // Chunk-content view: which chunk row is expanded, and the fetched
  // payload per chunk CID. Content is fetched once per chunk on first
  // expand; the API verifies the bytes against the CID server-side.
  const [expandedChunk, setExpandedChunk] = React.useState<string | null>(null);
  const [chunkStates, setChunkStates] = React.useState<Record<string, ChunkFetchState>>({});

  const loadChunk = React.useCallback(
    (chunkCid: string) => {
      setChunkStates((prev) =>
        prev[chunkCid] ? prev : { ...prev, [chunkCid]: { status: "loading" } },
      );
      fetchChunkContent(chunkCid, cid)
        .then((content) =>
          setChunkStates((prev) => ({
            ...prev,
            [chunkCid]: { status: "ready", content },
          })),
        )
        .catch((error: unknown) =>
          setChunkStates((prev) => ({
            ...prev,
            [chunkCid]: {
              status: "error",
              message: error instanceof Error ? error.message : "fetch failed",
            },
          })),
        );
    },
    [cid],
  );

  const toggleChunk = (chunkCid: string) => {
    setExpandedChunk((prev) => (prev === chunkCid ? null : chunkCid));
    const existing = chunkStates[chunkCid];
    if (!existing || existing.status === "error") loadChunk(chunkCid);
  };

  // Anchor-payload view: decoded payload(s) per anchor tx, fetched from
  // the tx→payload endpoint on first expand.
  type AnchorFetchState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
        status: "ready";
        anchors: Array<Record<string, unknown>>;
        source: "receipt" | "indexer";
      };
  const [expandedAnchor, setExpandedAnchor] = React.useState<string | null>(null);
  const [anchorStates, setAnchorStates] = React.useState<Record<string, AnchorFetchState>>({});

  const toggleAnchor = (hit: SearchHit) => {
    const key = `${hit.chainId}:${hit.txHash}`;
    setExpandedAnchor((prev) => (prev === key ? null : key));
    const existing = anchorStates[key];
    if (existing && existing.status !== "error") return;
    setAnchorStates((prev) => ({ ...prev, [key]: { status: "loading" } }));
    fetch(`/api/v1/explorer/tx/${encodeURIComponent(hit.chainId)}/${hit.txHash}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `request failed (${res.status})`);
        }
        const tx = (await res.json()) as {
          anchors?: Array<Record<string, unknown>>;
          source?: "receipt" | "indexer";
        };
        setAnchorStates((prev) => ({
          ...prev,
          [key]: {
            status: "ready",
            anchors: tx.anchors ?? [],
            source: tx.source === "indexer" ? "indexer" : "receipt",
          },
        }));
      })
      .catch((error: unknown) =>
        setAnchorStates((prev) => ({
          ...prev,
          [key]: {
            status: "error",
            message: error instanceof Error ? error.message : "fetch failed",
          },
        })),
      );
  };

  // Real reassembly: every chunk's bytes ride the indexed anchor
  // payloads, so the file is rebuilt by fetching each verified chunk
  // and concatenating in index order. Only offered when every chunk
  // actually embeds data — anchor-only trails keep the explanatory
  // placeholder download.
  const allChunksCarryData = chunks.length > 0 && chunks.every((c) => c.hasData);
  const [rebuildState, setRebuildState] = React.useState<
    { status: "idle" } | { status: "working" } | { status: "error"; message: string }
  >({ status: "idle" });

  const rebuildAndDownload = async () => {
    if (!allChunksCarryData) {
      const blob = new Blob(
        [
          `CID: ${cid}\nAnchors: ${hits.length} across ${chainIdSet.size} chain(s).\n\nThis file's anchors attest to existence + integrity only — the chunk bytes were not embedded on-chain, so the explorer cannot reassemble the content. Re-upload with on-chain storage enabled to make the file rebuildable.`,
        ],
        { type: "text/plain" },
      );
      triggerDownload(blob, `${truncateCID(cid, 8, 6)}.rebuild.txt`);
      return;
    }
    setRebuildState({ status: "working" });
    try {
      const parts = await Promise.all(
        chunks.map((chunk) => fetchChunkContent(chunk.cid, cid)),
      );
      const ordered = [...parts].sort((a, b) => a.index - b.index);
      const failed = ordered.find((p) => !p.dataBase64 || !p.verified);
      if (failed) {
        throw new Error(
          `chunk ${failed.index + 1} ${failed.dataBase64 ? "failed CID verification" : "carries no data"}`,
        );
      }
      const buffers = ordered.map((p) => base64ToBytes(p.dataBase64 as string));
      const text = utf8OrNull(concatBytes(buffers));
      const isSvg = text !== null && looksLikeSvg(text);
      const blob = new Blob(buffers as BlobPart[], {
        type: isSvg ? "image/svg+xml" : "application/octet-stream",
      });
      triggerDownload(blob, `${truncateCID(cid, 8, 6)}${isSvg ? ".svg" : ".bin"}`);
      setRebuildState({ status: "idle" });
    } catch (error) {
      setRebuildState({
        status: "error",
        message: error instanceof Error ? error.message : "rebuild failed",
      });
    }
  };

  return (
    <PageShell size="wide" padding="lg">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1 text-xs text-muted">
        <Link href="/explorer" className="hover:text-foreground">
          Explorer
        </Link>
        <span aria-hidden>›</span>
        <span className="truncate font-mono">{truncateCID(cid, 12, 10)}</span>
      </nav>

      {/* Header card ----------------------------------------- */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="rounded-2xl border border-border bg-surface p-5 md:p-7"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-bold tracking-tight text-foreground md:text-2xl">
                {truncateCID(cid, 14, 12)}
              </h1>
              <span className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                CIDv1
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 break-all">
              <span
                className="font-mono text-sm text-foreground"
                title={cid}
              >
                {cid}
              </span>
              <CopyButton value={cid} ariaLabel="Copy full CID" />
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Every on-chain anchor for this CID, one row per chain. The
              indexer reads the FileRegistry <code className="font-mono text-[12px]">CIDAnchored</code> +
              <code className="font-mono text-[12px]">ChunkAnchored</code> events on every
              provisioned EVM chain — your honest view of how widely this
              CID is attested.
            </p>
          </div>

          {/* Quick action */}
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="secondary"
                leftIcon={<FiDownload size={14} />}
                disabled={rebuildState.status === "working"}
                onClick={() => void rebuildAndDownload()}
              >
                {rebuildState.status === "working"
                  ? "Rebuilding…"
                  : "Rebuild & download"}
              </Button>
              {rebuildState.status === "error" && (
                <span className="max-w-[220px] text-right text-[11px] text-danger">
                  {rebuildState.message}
                </span>
              )}
            </div>
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
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-3">
          <DetailStat
            label="Chains"
            value={compactNumber(chainIdSet.size)}
            hint={`${hits.length} anchor${hits.length === 1 ? "" : "s"} · ${runtimeSet.size} runtime${runtimeSet.size === 1 ? "" : "s"}${pendingHits.length > 0 ? ` · ${pendingHits.length} pending` : ""}`}
          />
          <DetailStat
            label="Submitters"
            value={compactNumber(uniqueSubmitters.size)}
            hint={
              uniqueSubmitters.size === 1 && submitter
                ? truncateAddress(submitter, 8)
                : "Distinct addresses"
            }
            mono
          />
          <DetailStat
            label="Content bytes"
            value={
              chunks.length === 0
                ? "anchor-only"
                : allChunksEmbedBytes
                  ? formatBytes(embeddedBytes)
                  : `${chunksWithData} / ${chunks.length}`
            }
            hint={
              chunks.length === 0
                ? "No chunk records indexed"
                : allChunksEmbedBytes
                  ? `On-chain across ${chunks.length} chunk${chunks.length === 1 ? "" : "s"} · rebuildable`
                  : chunksWithData === 0
                    ? `${chunks.length} chunk${chunks.length === 1 ? "" : "s"}, bytes not embedded`
                    : "Chunks carrying on-chain bytes"
            }
          />
        </div>
      </motion.section>

      {/* Tabs ------------------------------------------------ */}
      <div className="mt-8 flex items-center gap-1 border-b border-border">
        {(
          [
            { id: "anchors", label: `Anchors · ${hits.length}` },
            { id: "chunks", label: `Chunks · ${chunks.length}` },
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
          <div className="hidden border-b border-border bg-surface-elevated px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_90px] md:gap-4">
            <span>Chain</span>
            <span>Tx hash</span>
            <span>Block</span>
            <span>Age</span>
            <span>Submitter</span>
            <span className="text-right">Link</span>
          </div>
          <ul role="list" className="divide-y divide-border">
            {hits.map((hit, i) => {
              const chainRec = getChain(hit.chainId);
              const realUrl = chainRec ? buildTxUrl(chainRec, hit.txHash) : "#";
              const anchorKey = `${hit.chainId}:${hit.txHash}`;
              const isExpanded = expandedAnchor === anchorKey;
              const anchorState = anchorStates[anchorKey];
              return (
                <motion.li
                  key={`${hit.txHash}-${hit.logIndex}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: i * 0.03, ease: EASE_OUT }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => toggleAnchor(hit)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleAnchor(hit);
                      }
                    }}
                    className="group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 transition-colors hover:bg-surface-elevated md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_90px] md:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {isExpanded ? (
                        <FiChevronDown size={13} className="shrink-0 text-muted" />
                      ) : (
                        <FiChevronRight size={13} className="shrink-0 text-muted" />
                      )}
                      <ChainBadge
                        chainId={hit.chainId}
                        chainName={hit.chainName}
                        shortName={hit.chainShortName}
                        size="md"
                      />
                      <StatusPill status={hit.status} />
                    </div>
                    <div
                      className="hidden min-w-0 items-center gap-2 md:flex"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                    <div
                      className="hidden min-w-0 md:block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        href={`/profile/${hit.submitter}`}
                        className="truncate font-mono text-xs text-foreground hover:text-primary"
                        title={hit.submitter}
                      >
                        {truncateAddress(hit.submitter, 5)}
                      </Link>
                    </div>
                    <div className="col-span-2 mt-2 flex items-center justify-between gap-2 md:col-span-1 md:mt-0 md:justify-end">
                      <span className="font-mono text-[10px] text-muted md:hidden">
                        block {formatBlockNumber(hit.blockNumber)} ·{" "}
                        {formatRelativeTime(hit.timestamp)} ·{" "}
                        {truncateAddress(hit.submitter, 4)}
                      </span>
                      <Link
                        href={realUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-[11px] text-foreground transition-colors hover:border-primary/50 hover:text-primary"
                        aria-label={`View ${hit.chainName} explorer`}
                      >
                        Explorer <FiExternalLink size={11} />
                      </Link>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border bg-surface-elevated px-4 py-3">
                      {!anchorState || anchorState.status === "loading" ? (
                        <InlineLoader label="Reading the tx receipt…" />
                      ) : anchorState.status === "error" ? (
                        <p className="text-xs text-muted">
                          Could not decode this transaction&rsquo;s payload (
                          {anchorState.message}) — the indexed row above still
                          attests to the anchor.
                        </p>
                      ) : anchorState.anchors.length === 0 ? (
                        <p className="text-xs text-muted">
                          No FileOnChain payload decoded from this transaction.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                            {anchorState.source === "receipt"
                              ? "Decoded anchor payload — read back from the tx receipt, not the database"
                              : "Decoded anchor payload — from the FileOnChain indexer (the chain RPC could not serve the receipt just now)"}
                          </p>
                          {anchorState.anchors.map((payload, idx) => (
                            <JsonCode
                              key={idx}
                              className="max-h-64 overflow-auto rounded-lg border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-foreground"
                              code={JSON.stringify(
                                typeof payload.d === "string"
                                  ? {
                                      ...payload,
                                      d: `<${payload.d.length} base64 chars embedded — see the Chunks tab for the decoded content>`,
                                    }
                                  : payload,
                                null,
                                2,
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
          ) : chunks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
              No chunk-level anchors for this CID. File-level anchors
              still attest to its existence; chunks become visible when a
              submitter anchors the per-chunk payload.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border px-4 py-2.5 text-xs text-muted">
                <span className="font-semibold text-foreground">
                  {chunks.length} chunk{chunks.length === 1 ? "" : "s"}
                </span>
                <span aria-hidden>·</span>
                {chunksWithData === chunks.length ? (
                  <span className="text-success">
                    all bytes on-chain ({formatBytes(embeddedBytes)}) — rebuildable
                  </span>
                ) : chunksWithData === 0 ? (
                  <span>anchor-only — existence + integrity attested, bytes not embedded</span>
                ) : (
                  <span>
                    {chunksWithData} of {chunks.length} carry on-chain bytes
                    ({formatBytes(embeddedBytes)}) — rebuild needs all of them
                  </span>
                )}
              </div>
              <div className="hidden border-b border-border bg-surface-elevated px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid md:grid-cols-[60px_minmax(0,1fr)_90px_90px_60px] md:gap-3">
                <span>#</span>
                <span>Chunk CID</span>
                <span className="text-right">Size</span>
                <span className="text-right">Data</span>
                <span className="text-right">Copy</span>
              </div>
              <ul role="list" className="max-h-[560px] divide-y divide-border overflow-y-auto">
                {chunks.map((chunk, i) => {
                  const isExpanded = expandedChunk === chunk.cid;
                  const state = chunkStates[chunk.cid];
                  return (
                    <motion.li
                      key={chunk.cid + i}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.012, ease: EASE_OUT }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => toggleChunk(chunk.cid)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleChunk(chunk.cid);
                          }
                        }}
                        className="grid cursor-pointer grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 font-mono text-xs transition-colors hover:bg-surface-elevated md:grid-cols-[60px_minmax(0,1fr)_90px_90px_60px]"
                      >
                        <span className="flex items-center gap-1.5 font-semibold tabular-nums text-foreground">
                          {isExpanded ? (
                            <FiChevronDown size={12} className="shrink-0 text-muted" />
                          ) : (
                            <FiChevronRight size={12} className="shrink-0 text-muted" />
                          )}
                          {chunk.index + 1}
                        </span>
                        <span
                          className="min-w-0 truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/explorer/${chunk.cid}`}
                            className="text-foreground hover:text-primary"
                            title={chunk.cid}
                          >
                            {chunk.cid}
                          </Link>
                        </span>
                        <span className="hidden text-right tabular-nums text-muted md:block">
                          {chunk.hasData ? formatBytes(chunk.sizeBytes) : "—"}
                        </span>
                        <span className="hidden justify-end md:flex">
                          {chunk.hasData ? (
                            <span className="rounded-full border border-success/40 px-2 py-0.5 text-[10px] text-success">
                              on-chain
                            </span>
                          ) : (
                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">
                              anchor-only
                            </span>
                          )}
                        </span>
                        <span
                          className="col-span-1 flex justify-end"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <CopyButton value={chunk.cid} ariaLabel="Copy chunk CID" />
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-border bg-surface-elevated px-4 py-3">
                          <ChunkContentPanel state={state} chunk={chunk} />
                        </div>
                      )}
                    </motion.li>
                  );
                })}
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
              Nothing related yet. Other CIDs from the same submitter — and,
              for a chunk, its parent file — appear here as they are indexed.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="hidden border-b border-border bg-surface-elevated px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid md:grid-cols-[minmax(0,2fr)_130px_minmax(0,1fr)_minmax(0,1.3fr)_40px] md:gap-4">
                <span>CID</span>
                <span>Relation</span>
                <span>Chains</span>
                <span>Last anchored</span>
                <span aria-hidden />
              </div>
              <ul role="list" className="divide-y divide-border">
                {related.map((r, i) => {
                  const lastAnchored =
                    r.hits.length > 0
                      ? Math.max(...r.hits.map((h) => h.timestamp))
                      : null;
                  const chainNames = Array.from(
                    new Set(r.hits.map((h) => h.chainShortName)),
                  );
                  return (
                    <motion.li
                      key={r.cid}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.02, ease: EASE_OUT }}
                    >
                      <Link
                        href={`/explorer/${r.cid}`}
                        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:grid-cols-[minmax(0,2fr)_130px_minmax(0,1fr)_minmax(0,1.3fr)_40px] md:gap-4"
                      >
                        <span
                          className="truncate font-mono text-xs text-foreground"
                          title={r.cid}
                        >
                          {truncateCID(r.cid, 12, 10)}
                        </span>
                        <span className="justify-self-end md:justify-self-start">
                          {r.relation === "parent-file" ? (
                            <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {RELATION_LABEL[r.relation]}
                            </span>
                          ) : (
                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">
                              {RELATION_LABEL[r.relation]}
                            </span>
                          )}
                        </span>
                        <span className="hidden min-w-0 truncate font-mono text-xs text-foreground md:block">
                          {r.hits.length === 0 ? (
                            <span className="text-muted">not indexed yet</span>
                          ) : (
                            <>
                              {chainNames.slice(0, 2).join(" · ")}
                              {chainNames.length > 2 && (
                                <span className="text-muted"> +{chainNames.length - 2}</span>
                              )}
                            </>
                          )}
                        </span>
                        <span className="hidden font-mono text-xs tabular-nums text-foreground md:block">
                          {lastAnchored === null ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <>
                              {formatRelativeTime(lastAnchored)}
                              <span className="ml-2 text-[10px] text-muted">
                                {formatTimestamp(lastAnchored)}
                              </span>
                            </>
                          )}
                        </span>
                        <span className="col-span-2 mt-1 flex items-center justify-between md:col-span-1 md:mt-0 md:justify-end">
                          <span className="font-mono text-[10px] text-muted md:hidden">
                            {r.hits.length} anchor{r.hits.length === 1 ? "" : "s"}
                            {lastAnchored !== null &&
                              ` · ${formatRelativeTime(lastAnchored)}`}
                          </span>
                          <FiArrowRight
                            size={13}
                            className="text-muted transition-transform duration-base group-hover:translate-x-0.5 group-hover:text-primary"
                          />
                        </span>
                      </Link>
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          )}
        </motion.section>
      )}

      {/* Provenance footer ------------------------------------
          One honest panel instead of three cards. Everything here is
          derived from the indexed hits — no synthesized counts, no
          unconditional "Pass" badge. The claims follow the language
          policy: anchors attest existence, integrity of the
          identifier, submitters, and timing — never truth. */}
      <section className="mt-12 rounded-2xl border border-border bg-surface p-5 md:p-7">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between md:gap-10">
          <div className="max-w-lg">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              What these anchors attest
            </p>
            <p className="mt-2.5 text-sm leading-relaxed text-foreground">
              That this content identifier existed
              {firstAnchoredAt !== null && (
                <> by <span className="font-mono text-[13px]">{formatTimestamp(firstAnchoredAt)}</span></>
              )}
              , that its bytes hash back to it, and which address
              {uniqueSubmitters.size === 1 ? "" : "es"} committed it — on{" "}
              {chainIdSet.size} chain{chainIdSet.size === 1 ? "" : "s"}, each
              independently.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Anchors don&rsquo;t make the content true, lawful, or authored by
              the submitter — they are the submitter&rsquo;s signed assertion,
              locally verifiable by anyone.{" "}
              {allChunksEmbedBytes
                ? "The bytes themselves ride the chunk anchors, so this file is rebuildable from chain data alone."
                : "The bytes are not embedded on-chain; retrieval depends on the underlying storage system staying available."}
            </p>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-1 md:gap-y-4">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                First anchored
              </dt>
              <dd className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
                {firstAnchoredAt !== null ? formatTimestamp(firstAnchoredAt) : "—"}
              </dd>
            </div>
            {latestAnchoredAt !== null && latestAnchoredAt !== firstAnchoredAt && (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Latest anchor
                </dt>
                <dd className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
                  {formatTimestamp(latestAnchoredAt)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Anchored on
              </dt>
              <dd className="mt-0.5 font-mono text-xs text-foreground">
                {chainShortNames.length > 0 ? chainShortNames.join(" · ") : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </PageShell>
  );
};

/* ----------------------------------------------------------------------------
 * Chunk content panel — the expanded view under a chunk row: verified
 * on-chain bytes rendered as an SVG/text/hex preview, or an honest
 * explanation when the anchor carried no data.
 * --------------------------------------------------------------------------- */
interface ChunkContentPanelProps {
  state: ChunkFetchState | undefined;
  chunk: ChunkRow;
}

const ChunkContentPanel = ({ state, chunk }: ChunkContentPanelProps) => {
  if (!state || state.status === "loading") {
    return <InlineLoader label="Fetching on-chain bytes…" className="py-8" />;
  }
  if (state.status === "error") {
    return (
      <p className="text-xs text-muted">
        Could not load this chunk&rsquo;s payload ({state.message}). The row
        above still attests to the chunk&rsquo;s CID on-chain.
      </p>
    );
  }

  const { content } = state;
  const chainRec = getChain(content.chainId);
  const txUrl = chainRec ? buildTxUrl(chainRec, content.txHash) : "#";

  let bytes: Uint8Array | null = null;
  if (content.dataBase64) {
    try {
      bytes = base64ToBytes(content.dataBase64);
    } catch {
      bytes = null;
    }
  }
  const text = bytes ? utf8OrNull(bytes) : null;
  const isSvg = text !== null && looksLikeSvg(text);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {content.verified ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/40 px-2 py-0.5 font-semibold text-success">
            <FiCheck size={11} /> bytes match CID
          </span>
        ) : content.hasData ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-danger/40 px-2 py-0.5 font-semibold text-danger">
            <FiAlertTriangle size={11} /> bytes do NOT match this CID
          </span>
        ) : null}
        <span className="text-muted">
          chunk {content.index + 1} of {content.total}
        </span>
        {bytes && <span className="text-muted">· {formatBytes(bytes.length)}</span>}
        <Link
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-foreground hover:text-primary"
        >
          {truncateCID(content.txHash, 8, 6)} <FiExternalLink size={10} />
        </Link>
      </div>

      {!content.hasData ? (
        <p className="text-xs leading-relaxed text-muted">
          This anchor attests to the chunk&rsquo;s existence and integrity
          only — the bytes themselves were not embedded on-chain, so there
          is no content to display. Uploads with on-chain storage enabled
          embed the bytes in the anchor payload.
        </p>
      ) : !bytes ? (
        <p className="text-xs text-muted">
          The embedded payload could not be decoded as base64.
        </p>
      ) : (
        <>
          {isSvg && content.verified && (
            <div className="flex items-center justify-center rounded-lg border border-border bg-surface p-4">
              {/* Rendered via <img>, which executes no scripts — safe for
                  untrusted on-chain SVG bytes (verified against the CID). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/svg+xml;base64,${content.dataBase64}`}
                alt={`Chunk ${content.index + 1} SVG preview`}
                className="max-h-64 max-w-full"
              />
            </div>
          )}
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {text ?? hexDump(bytes)}
          </pre>
        </>
      )}
    </div>
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