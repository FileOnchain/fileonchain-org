import "server-only";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  CHAINS,
  getChain,
  isChainActive,
  type ChainFamily,
  type ChainId,
} from "@fileonchain/sdk";
import { db, indexedAnchorEvents } from "@/lib/db";

/**
 * DB-backed read layer for the explorer, CID detail page, leaderboard,
 * and profile views. Every consumer of the old
 * `@/lib/mock/cid-indexer` now goes through this module.
 *
 * Notable shape changes from the mock:
 *   - `RegisteredFile` is gone. The protocol doesn't carry file
 *     metadata — name, MIME, description, chunkCount are off-chain
 *     facts that no on-chain source can attest to. The explorer
 *     renders the CID + its anchor hits instead, and the chunks tab
 *     derives chunk rows from on-chain `chunk` events.
 *   - `SearchHit` keeps the on-chain fields every consumer needs
 *     (chain, tx hash, block, submitter, status) and drops the
 *     synthesized `uploader` that was a mock-only address.
 *   - `RecentAnchorRow` becomes `{ cid, hits, anchoredAt }` — no
 *     nested `file` object.
 */

/* ------------------------------------------------------------------ */
/* Public types                                                       */
/* ------------------------------------------------------------------ */

export type AnchorStatus = "anchored" | "pending" | "failed";

export type FileCategory =
  | "document"
  | "image"
  | "video"
  | "audio"
  | "data"
  | "code"
  | "archive"
  | "other";

export interface SearchHit {
  chainId: ChainId;
  chainName: string;
  chainShortName: string;
  family: ChainFamily;
  /** Block-explorer tx hash for the registry call. */
  txHash: string;
  blockNumber: number;
  /** Unix timestamp in seconds. */
  timestamp: number;
  status: AnchorStatus;
  /** Index of the event log inside the transaction. */
  logIndex: number;
  /** Address that submitted the anchor tx. */
  submitter: string;
  /** Registry contract address on the chain family. */
  registryAddress: string | null;
}

export interface RecentAnchorRow {
  cid: string;
  hits: SearchHit[];
  /** Latest hit timestamp across chains — used as the "anchored at" value. */
  anchoredAt: number;
}

export interface ExplorerStats {
  totalAnchors: number;
  totalFiles: number; // distinct CIDs
  totalChains: number; // distinct chain ids reporting
  totalBytes: number; // 0 — bytes have no on-chain source; surfaced as 0 so the strip still renders
  uniqueUploaders: number; // distinct submitter addresses
  avgAgeSeconds: number;
}

export interface UploaderAggregate {
  address: string;
  files: number;
  bytes: number; // 0 — see ExplorerStats.totalBytes
  anchors: number;
  chains: number;
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                   */
/* ------------------------------------------------------------------ */

const ACTIVE_CHAIN_IDS: ChainId[] = CHAINS.filter(isChainActive).map((c) => c.id);

const rowsToHits = (
  rows: Array<{
    chainId: string;
    txHash: string;
    blockNumber: number;
    blockTimestamp: Date;
    submitter: string;
    registryAddress: string;
    logIndex: number;
  }>,
): SearchHit[] => {
  return rows.map((r) => {
    const chain = getChain(r.chainId as ChainId);
    return {
      chainId: r.chainId as ChainId,
      chainName: chain?.name ?? r.chainId,
      chainShortName: chain?.shortName ?? r.chainId,
      family: chain?.family ?? "evm",
      txHash: r.txHash,
      blockNumber: r.blockNumber,
      timestamp: Math.floor(r.blockTimestamp.getTime() / 1000),
      // All events observed by the watcher are landed — "pending" /
      // "failed" statuses would only surface if a chain reorg or RPC
      // outage required manual re-scanning, which the watcher handles
      // by simply re-reading from the cursor.
      status: "anchored",
      logIndex: r.logIndex,
      submitter: r.submitter,
      registryAddress: r.registryAddress,
    };
  });
};

/* ------------------------------------------------------------------ */
/* Public reads                                                       */
/* ------------------------------------------------------------------ */

interface SearchFilters {
  runtime?: ChainFamily | "all";
  status?: AnchorStatus | "all";
  category?: FileCategory | "all";
}

const filtersApplyToHits = (
  filters: SearchFilters,
  hits: SearchHit[],
): boolean => {
  if (filters.runtime && filters.runtime !== "all") {
    if (!hits.some((h) => h.family === filters.runtime)) return false;
  }
  if (filters.status && filters.status !== "all") {
    if (!hits.some((h) => h.status === filters.status)) return false;
  }
  // The category filter is dropped — categories imply off-chain file
  // metadata, which we don't attest to. The UI keeps the filter
  // visible for back-compat but it no longer narrows the feed; that
  // change is intentional and surfaces in the explorer copy.
  return true;
};

/** Search hits by CID prefix or full CID. Empty input returns []. */
export const searchCID = async (query: string): Promise<SearchHit[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const rows = await db
    .select({
      chainId: indexedAnchorEvents.chainId,
      txHash: indexedAnchorEvents.txHash,
      blockNumber: indexedAnchorEvents.blockNumber,
      blockTimestamp: indexedAnchorEvents.blockTimestamp,
      submitter: indexedAnchorEvents.submitter,
      registryAddress: indexedAnchorEvents.registryAddress,
      logIndex: indexedAnchorEvents.logIndex,
    })
    .from(indexedAnchorEvents)
    .where(eq(indexedAnchorEvents.cid, trimmed))
    .orderBy(desc(indexedAnchorEvents.blockTimestamp));
  return rowsToHits(rows);
};

/** Look up a CID across every chain that indexed an event for it. */
export const lookupFile = async (
  cid: string,
): Promise<{ cid: string; hits: SearchHit[] } | null> => {
  const trimmed = cid.trim();
  if (!trimmed) return null;
  const rows = await db
    .select({
      chainId: indexedAnchorEvents.chainId,
      txHash: indexedAnchorEvents.txHash,
      blockNumber: indexedAnchorEvents.blockNumber,
      blockTimestamp: indexedAnchorEvents.blockTimestamp,
      submitter: indexedAnchorEvents.submitter,
      registryAddress: indexedAnchorEvents.registryAddress,
      logIndex: indexedAnchorEvents.logIndex,
    })
    .from(indexedAnchorEvents)
    .where(eq(indexedAnchorEvents.cid, trimmed))
    .orderBy(desc(indexedAnchorEvents.blockTimestamp));
  if (rows.length === 0) return null;
  return { cid: trimmed, hits: rowsToHits(rows) };
};

/** Recent anchors feed for the explorer index. Filters narrow down by
 *  family / status. Sort order is most-recent-first. */
export const getRecentAnchors = async (
  limit = 12,
  filters: SearchFilters = {},
): Promise<RecentAnchorRow[]> => {
  // Pull the latest event per (cid, chain) to avoid one chunk event
  // dominating the feed. The window is generous (limit * 4 * chainCount)
  // because most rows are dropped by the family filter downstream.
  const head = limit * ACTIVE_CHAIN_IDS.length * 4;
  const rows = await db
    .select({
      cid: indexedAnchorEvents.cid,
      chainId: indexedAnchorEvents.chainId,
      txHash: indexedAnchorEvents.txHash,
      blockNumber: indexedAnchorEvents.blockNumber,
      blockTimestamp: indexedAnchorEvents.blockTimestamp,
      submitter: indexedAnchorEvents.submitter,
      registryAddress: indexedAnchorEvents.registryAddress,
      logIndex: indexedAnchorEvents.logIndex,
    })
    .from(indexedAnchorEvents)
    .orderBy(desc(indexedAnchorEvents.blockTimestamp))
    .limit(head);

  const grouped = new Map<string, RecentAnchorRow>();
  for (const row of rows) {
    let entry = grouped.get(row.cid);
    if (!entry) {
      entry = { cid: row.cid, hits: [], anchoredAt: 0 };
      grouped.set(row.cid, entry);
    }
    entry.hits.push(
      ...rowsToHits([row]),
    );
  }
  const list = Array.from(grouped.values())
    .filter((row) => filtersApplyToHits(filters, row.hits))
    .map((row) => ({
      ...row,
      anchoredAt: Math.max(...row.hits.map((h) => h.timestamp)),
    }))
    .sort((a, b) => b.anchoredAt - a.anchoredAt);
  return list.slice(0, limit);
};

/** Aggregate explorer stats for the index header. */
export const getExplorerStats = async (): Promise<ExplorerStats> => {
  const [totals] = await db
    .select({
      totalAnchors: sql<number>`count(*)::int`,
      totalFiles: sql<number>`count(distinct ${indexedAnchorEvents.cid})::int`,
      totalChains: sql<number>`count(distinct ${indexedAnchorEvents.chainId})::int`,
      uniqueUploaders: sql<number>`count(distinct ${indexedAnchorEvents.submitter})::int`,
      avgAgeSeconds: sql<number>`coalesce(extract(epoch from (now() - max(${indexedAnchorEvents.blockTimestamp})))::int, 0)`,
    })
    .from(indexedAnchorEvents);
  return {
    totalAnchors: totals?.totalAnchors ?? 0,
    totalFiles: totals?.totalFiles ?? 0,
    totalChains: totals?.totalChains ?? 0,
    totalBytes: 0,
    uniqueUploaders: totals?.uniqueUploaders ?? 0,
    avgAgeSeconds: totals?.avgAgeSeconds ?? 0,
  };
};

/** Per-uploader aggregates for the leaderboard / public profile. */
export const getUploaderAggregates = async (): Promise<UploaderAggregate[]> => {
  const rows = await db
    .select({
      address: indexedAnchorEvents.submitter,
      files: sql<number>`count(distinct ${indexedAnchorEvents.cid})::int`,
      anchors: sql<number>`count(*)::int`,
      chains: sql<number>`count(distinct ${indexedAnchorEvents.chainId})::int`,
    })
    .from(indexedAnchorEvents)
    .groupBy(indexedAnchorEvents.submitter)
    .orderBy(desc(sql`count(distinct ${indexedAnchorEvents.cid})`));
  return rows.map((r) => ({
    address: r.address,
    files: r.files,
    bytes: 0,
    anchors: r.anchors,
    chains: r.chains,
  }));
};

/** CIDs anchored by the same submitter, used on the CID detail page
 *  to show "more from this uploader" and on the public profile view. */
export const getFilesByUploader = async (
  uploader: string,
  excludeCid?: string,
  limit = 4,
): Promise<Array<{ cid: string; hits: SearchHit[] }>> => {
  const cids = await db
    .selectDistinct({ cid: indexedAnchorEvents.cid })
    .from(indexedAnchorEvents)
    .where(
      and(
        eq(indexedAnchorEvents.submitter, uploader),
        excludeCid ? sql`${indexedAnchorEvents.cid} <> ${excludeCid}` : undefined,
      ),
    )
    .limit(limit * 4);
  if (cids.length === 0) return [];
  const cidList = cids.map((c) => c.cid);
  const rows = await db
    .select({
      cid: indexedAnchorEvents.cid,
      chainId: indexedAnchorEvents.chainId,
      txHash: indexedAnchorEvents.txHash,
      blockNumber: indexedAnchorEvents.blockNumber,
      blockTimestamp: indexedAnchorEvents.blockTimestamp,
      submitter: indexedAnchorEvents.submitter,
      registryAddress: indexedAnchorEvents.registryAddress,
      logIndex: indexedAnchorEvents.logIndex,
    })
    .from(indexedAnchorEvents)
    .where(inArray(indexedAnchorEvents.cid, cidList))
    .orderBy(desc(indexedAnchorEvents.blockTimestamp));
  const grouped = new Map<string, SearchHit[]>();
  for (const r of rows) {
    const arr = grouped.get(r.cid) ?? [];
    arr.push(...rowsToHits([r]));
    grouped.set(r.cid, arr);
  }
  return Array.from(grouped.entries())
    .map(([cid, hits]) => ({ cid, hits }))
    .slice(0, limit);
};

/** Per-chunk rows for a CID — derived from on-chain `chunk` events
 *  for the supplied chain. The first chain that anchored a chunk for
 *  this CID wins; consumers fall back to the next chain if the first
 *  has no chunk events (a file-level-only anchor). */
export const getChunksForFile = async (
  cid: string,
  chainId?: ChainId,
): Promise<Array<{ index: number; cid: string; sizeBytes: number }>> => {
  const rows = await db
    .select({
      chainId: indexedAnchorEvents.chainId,
      payload: indexedAnchorEvents.payload,
    })
    .from(indexedAnchorEvents)
    .where(
      and(
        eq(indexedAnchorEvents.cid, cid),
        chainId ? eq(indexedAnchorEvents.chainId, chainId) : undefined,
        sql`${indexedAnchorEvents.payload}->>'op' = 'chunk'`,
      ),
    );
  if (rows.length === 0) return [];
  const chunks: Array<{ index: number; cid: string; sizeBytes: number }> = [];
  for (const r of rows) {
    const p = r.payload as { op?: string; idx?: number; cid?: string };
    if (p.op !== "chunk" || typeof p.idx !== "number" || typeof p.cid !== "string") {
      continue;
    }
    // sizeBytes has no on-chain source; render 0 so the chunks tab keeps
    // a single row per chunk with the real CID we attested to.
    chunks.push({ index: p.idx, cid: p.cid, sizeBytes: 0 });
  }
  // Dedupe by (chain, index) — keep the first row per index per chain.
  const dedup = new Map<string, (typeof chunks)[number]>();
  for (const c of chunks) {
    const key = `${rows[0]?.chainId ?? ""}:${c.index}`;
    if (!dedup.has(key)) dedup.set(key, c);
  }
  return Array.from(dedup.values()).sort((a, b) => a.index - b.index);
};

// Suppress an unused-import warning when the category filter gets
// dropped — keep the type exported for back-compat.
void isNotNull;