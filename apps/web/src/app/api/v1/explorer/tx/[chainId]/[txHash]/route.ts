import { NextResponse } from "next/server";
import type { ChainId } from "@fileonchain/sdk";
import { fetchTxPayloads } from "@/lib/explorer/tx-fetcher";
import { getIndexedTxPayloads } from "@/lib/indexer/queries";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/explorer/tx/[chainId]/[txHash]` — public API endpoint
 * for the on-demand explorer tx→payload decoder. Decodes the family-
 * specific tx envelope into FileOnChain anchor payload(s) on confirmed
 * transactions.
 *
 * Source order: the live receipt first (`source: "receipt"` — the
 * strongest read, straight off the chain). When the RPC cannot serve
 * it — load-balanced public pools intermittently miss txs the chain
 * has, and some families have no tx fetcher yet — the indexer's rows
 * for the tx answer instead (`source: "indexer"`): the same payloads,
 * decoded from the on-chain event at index time, honestly labeled so
 * the UI never presents them as a live receipt read.
 *
 * Response shape (200):
 *   { chainId, family?, txHash, status, blockHash?, blockNumber,
 *     timestamp, submitter, anchors, source }
 *
 * Errors:
 *   400  invalid chainId or txHash shape
 *   404  unknown chain, or tx known to neither the RPC nor the indexer
 *   502  upstream RPC failure with no indexed fallback
 *
 * Cache: confirmed receipt content is immutable — 24h edge cache with
 * a 7-day stale window. Indexer-sourced responses cache briefly (5m)
 * so a recovered RPC gets to reclaim the authoritative answer.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chainId: string; txHash: string }> },
) {
  const { chainId, txHash } = await params;
  // The colon in the chain id is URL-encoded as %3A in segments — accept
  // either form so curl users don't have to encode.
  const decodedChainId = decodeURIComponent(chainId) as ChainId;
  const decodedTxHash = decodeURIComponent(txHash);

  const result = await fetchTxPayloads(decodedChainId, decodedTxHash);

  if (result.supported) {
    return NextResponse.json(
      { ...result.tx, source: "receipt" },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  }

  if (result.reason === "unknown-chain" || result.reason === "invalid-tx-hash") {
    return NextResponse.json({ error: result.reason }, { status: 404 });
  }

  const indexed = await getIndexedTxPayloads(decodedChainId, decodedTxHash);
  if (indexed) {
    return NextResponse.json(
      {
        chainId: indexed.chainId,
        txHash: indexed.txHash,
        // Indexed rows are landed events by construction.
        status: "confirmed",
        blockNumber: indexed.blockNumber,
        timestamp: indexed.timestamp,
        submitter: indexed.submitter,
        anchors: indexed.anchors,
        source: "indexer",
        rpcReason: result.reason,
      },
      { headers: { "Cache-Control": "public, s-maxage=300" } },
    );
  }

  const status =
    result.reason === "tx-not-found"
      ? 404
      : 502;
  return NextResponse.json({ error: result.reason }, { status });
}
