import { NextResponse } from "next/server";
import { getExplorerStats, getRecentAnchors } from "@/lib/indexer/queries";

export const dynamic = "force-dynamic";

/**
 * `GET /api/indexer/recent` — public feed of the latest indexed anchor
 * events, shaped for the homepage's `LiveLedgerTicker`. The homepage is
 * a Client Component (it needs `useChain`), so it can't call the
 * DB-backed indexer directly the way the `/explorer` server page does —
 * this route is the same `getRecentAnchors` read behind a fetch.
 *
 * Returns `{ events: [{ cid, chain, anchoredAt }], stats: { totalAnchors,
 * totalFiles } }`, events newest first. `anchoredAt` is a unix timestamp
 * in seconds; the client formats the relative age so it's fresh at
 * render time. `stats` are the explorer's live totals, reused by the
 * hero's stat row. Both reads fail open (see `safeRead` in
 * `lib/indexer/queries`): an empty feed renders no ticker and zero
 * totals render no live tiles. No fabricated rows or counts.
 */
export async function GET() {
  const [rows, totals] = await Promise.all([getRecentAnchors(14), getExplorerStats()]);
  const events = rows.map((row) => ({
    cid: row.cid,
    chain: (
      row.hits[0]?.chainShortName ??
      row.hits[0]?.chainName ??
      ""
    ).toUpperCase(),
    anchoredAt: row.anchoredAt,
  }));
  return NextResponse.json(
    { events, stats: { totalAnchors: totals.totalAnchors, totalFiles: totals.totalFiles } },
    {
      headers: {
        // Cache at the edge briefly — the ticker is decoration-grade
        // freshness, not a data table; 30s keeps Neon off the hot path.
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    },
  );
}
