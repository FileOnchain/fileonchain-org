import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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

const EMPTY_STATS: ExplorerStats = {
  totalAnchors: 0,
  totalFiles: 0,
  totalChains: 0,
  totalBytes: 0,
  uniqueUploaders: 0,
  avgAgeSeconds: 0,
};

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

/**
 * The explorer, leaderboard, and profile pages are public
 * `force-dynamic` server components — every request hits Neon at render
 * time. A transient DB failure (or a deploy missing DATABASE_URL) used
 * to throw inside the Server Components render, which visitors see as
 * minified React error #441 with no context. Feed and aggregate reads
 * degrade to an empty fallback instead; the real error is logged
 * server-side where the deploy logs can surface it.
 *
 * `lookupFile` is deliberately NOT wrapped: mapping an outage to `null`
 * would make /explorer/[cid] render a real 404 claiming "no public
 * anchor record" — a false negative. That route keeps the error
 * boundary (retryable "something went wrong") when the DB is down.
 */
const safeRead = async <T>(
  label: string,
  fallback: T,
  read: () => Promise<T>,
): Promise<T> => {
  try {
    return await read();
  } catch (error) {
    console.error(`[indexer] ${label} read failed — serving fallback:`, error);
    return fallback;
  }
};

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
  // The category filter is intentionally a no-op — it implies off-chain
  // file metadata, which we don't attest to. The UI keeps the filter
  // visible for back-compat but no value narrows the feed; that
  // contract is documented in the explorer copy.
  void filters.category;
  return true;
};

/** Search hits by CID prefix or full CID. Empty input returns []. */
export const searchCID = async (query: string): Promise<SearchHit[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return safeRead("searchCID", [], async () => {
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
  });
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
  return safeRead("getRecentAnchors", [], async () => {
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
  });
};

/** Aggregate explorer stats for the index header. */
export const getExplorerStats = async (): Promise<ExplorerStats> => {
  return safeRead("getExplorerStats", EMPTY_STATS, async () => {
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
  });
};

/** Per-uploader aggregates for the leaderboard / public profile. */
export const getUploaderAggregates = async (): Promise<UploaderAggregate[]> => {
  return safeRead("getUploaderAggregates", [], async () => {
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
  });
};

/** CIDs anchored by the same submitter, used on the CID detail page
 *  to show "more from this uploader" and on the public profile view. */
export const getFilesByUploader = async (
  uploader: string,
  excludeCid?: string,
  limit = 4,
): Promise<Array<{ cid: string; hits: SearchHit[] }>> => {
  return safeRead("getFilesByUploader", [], async () => {
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
  });
};

export interface ChunkRow {
  index: number;
  cid: string;
  /** Decoded byte length of embedded data; 0 when the anchor carried none. */
  sizeBytes: number;
  chainId: ChainId;
  /** Tx that anchored this chunk on `chainId`. */
  txHash: string;
  /** Whether the anchor payload embeds the chunk bytes (`d`). */
  hasData: boolean;
}

/** Decoded byte length of a base64 string, without decoding it. */
const base64ByteLength = (b64: string): number => {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length / 4) * 3) - padding;
};

/** Per-chunk rows for a CID — derived from on-chain `chunk` events.
 *  Chunk rows are matched on the payload's `fileCid` (the row's own
 *  `cid` column holds the chunk CID, which only equals the file CID
 *  for single-chunk files). The first chain that anchored a chunk for
 *  this CID wins; consumers fall back to the next chain if the first
 *  has no chunk events (a file-level-only anchor). */
export const getChunksForFile = async (
  cid: string,
  chainId?: ChainId,
): Promise<ChunkRow[]> => {
  return safeRead("getChunksForFile", [], async () => {
    const rows = await db
      .select({
        chainId: indexedAnchorEvents.chainId,
        txHash: indexedAnchorEvents.txHash,
        blockTimestamp: indexedAnchorEvents.blockTimestamp,
        payload: indexedAnchorEvents.payload,
      })
      .from(indexedAnchorEvents)
      .where(
        and(
          chainId ? eq(indexedAnchorEvents.chainId, chainId) : undefined,
          sql`${indexedAnchorEvents.payload}->>'op' = 'chunk'`,
          sql`(${indexedAnchorEvents.payload}->>'fileCid' = ${cid} OR ${indexedAnchorEvents.cid} = ${cid})`,
        ),
      )
      .orderBy(indexedAnchorEvents.blockTimestamp);
    if (rows.length === 0) return [];
    const chunks: ChunkRow[] = [];
    for (const r of rows) {
      const p = r.payload as { op?: string; idx?: number; cid?: string; d?: string };
      if (p.op !== "chunk" || typeof p.idx !== "number" || typeof p.cid !== "string") {
        continue;
      }
      chunks.push({
        index: p.idx,
        cid: p.cid,
        sizeBytes: typeof p.d === "string" ? base64ByteLength(p.d) : 0,
        chainId: r.chainId,
        txHash: r.txHash,
        hasData: typeof p.d === "string",
      });
    }
    if (chunks.length === 0) return [];
    // First chain wins: the ordering above puts the earliest anchor first.
    const firstChain = chunks[0].chainId;
    const dedup = new Map<number, ChunkRow>();
    for (const c of chunks) {
      if (c.chainId !== firstChain) continue;
      const existing = dedup.get(c.index);
      // Prefer a data-carrying row for an index over an anchor-only one.
      if (!existing || (!existing.hasData && c.hasData)) dedup.set(c.index, c);
    }
    return Array.from(dedup.values()).sort((a, b) => a.index - b.index);
  });
};

export interface ChunkPayloadRow {
  chunkCid: string;
  fileCid: string;
  index: number;
  total: number;
  nextCid: string | null;
  chainId: ChainId;
  txHash: string;
  blockNumber: number;
  /** Seconds since the epoch. */
  timestamp: number;
  submitter: string;
  /** Base64 chunk bytes when the anchor embedded them; null when anchor-only. */
  dataBase64: string | null;
}

/** The indexed anchor payload for one chunk CID — the read behind the
 *  explorer's chunk-content view. Among the rows that anchored this
 *  chunk (multiple chains, or repeat anchors on one chain), the pick
 *  prefers a row belonging to `fileCid`, then a data-carrying payload
 *  over an anchor-only one; ties go to the earliest anchor.
 *
 *  `fileCid` is a preference hint, never a gate: the explorer feed
 *  lists chunk anchors under their own chunk CID, so the detail page
 *  a visitor lands on may pass the chunk CID itself as the "file" —
 *  filtering on it would 404 a chunk that is plainly indexed. The
 *  content is safe to serve regardless of which file it belongs to:
 *  the API re-verifies the bytes against the chunk CID either way, and
 *  the response names the payload's real `fileCid`.
 *
 *  Null only when the chunk CID was never indexed at all. */
export const getChunkPayload = async (
  chunkCid: string,
  fileCid?: string,
): Promise<ChunkPayloadRow | null> => {
  return safeRead("getChunkPayload", null, async () => {
    const rows = await db
      .select({
        chainId: indexedAnchorEvents.chainId,
        txHash: indexedAnchorEvents.txHash,
        blockNumber: indexedAnchorEvents.blockNumber,
        blockTimestamp: indexedAnchorEvents.blockTimestamp,
        submitter: indexedAnchorEvents.submitter,
        payload: indexedAnchorEvents.payload,
      })
      .from(indexedAnchorEvents)
      .where(
        and(
          eq(indexedAnchorEvents.cid, chunkCid),
          sql`${indexedAnchorEvents.payload}->>'op' = 'chunk'`,
        ),
      )
      .orderBy(indexedAnchorEvents.blockTimestamp);
    let best: ChunkPayloadRow | null = null;
    let bestScore = -1;
    for (const r of rows) {
      const p = r.payload as {
        op?: string;
        cid?: string;
        fileCid?: string;
        idx?: number;
        total?: number;
        next?: string;
        d?: string;
      };
      if (
        p.op !== "chunk" ||
        typeof p.cid !== "string" ||
        typeof p.fileCid !== "string" ||
        typeof p.idx !== "number" ||
        typeof p.total !== "number"
      ) {
        continue;
      }
      const row: ChunkPayloadRow = {
        chunkCid: p.cid,
        fileCid: p.fileCid,
        index: p.idx,
        total: p.total,
        nextCid: typeof p.next === "string" ? p.next : null,
        chainId: r.chainId,
        txHash: r.txHash,
        blockNumber: r.blockNumber,
        timestamp: Math.floor(r.blockTimestamp.getTime() / 1000),
        submitter: r.submitter,
        dataBase64: typeof p.d === "string" ? p.d : null,
      };
      // file match outranks data, data outranks earliest; rows arrive
      // earliest-first so a strict > keeps the first row per tier.
      const score =
        (fileCid && row.fileCid === fileCid ? 2 : 0) + (row.dataBase64 ? 1 : 0);
      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }
    return best;
  });
};

export interface IndexedTxPayloads {
  chainId: ChainId;
  txHash: string;
  blockNumber: number;
  /** Seconds since the epoch (latest row's block timestamp). */
  timestamp: number;
  submitter: string;
  /** One decoded anchor payload per indexed event log, log order. */
  anchors: object[];
}

/** Every anchor payload the indexer holds for one transaction — the
 *  fallback source for the explorer's anchor-content view when the
 *  chain RPC cannot serve the receipt (flaky public pools, or a family
 *  whose tx fetcher isn't wired). The payloads were decoded from the
 *  on-chain event at index time; serving them is honest as long as the
 *  response says the indexer — not the live receipt — is the source. */
export const getIndexedTxPayloads = async (
  chainId: ChainId,
  txHash: string,
): Promise<IndexedTxPayloads | null> => {
  return safeRead("getIndexedTxPayloads", null, async () => {
    const rows = await db
      .select({
        blockNumber: indexedAnchorEvents.blockNumber,
        blockTimestamp: indexedAnchorEvents.blockTimestamp,
        submitter: indexedAnchorEvents.submitter,
        logIndex: indexedAnchorEvents.logIndex,
        payload: indexedAnchorEvents.payload,
      })
      .from(indexedAnchorEvents)
      .where(
        and(
          eq(indexedAnchorEvents.chainId, chainId),
          eq(indexedAnchorEvents.txHash, txHash),
        ),
      )
      .orderBy(indexedAnchorEvents.logIndex);
    const first = rows[0];
    if (!first) return null;
    return {
      chainId,
      txHash,
      blockNumber: first.blockNumber,
      timestamp: Math.floor(first.blockTimestamp.getTime() / 1000),
      submitter: first.submitter,
      anchors: rows.map((r) => r.payload as object),
    };
  });
};