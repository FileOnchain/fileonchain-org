import { NextResponse } from "next/server";
import type { ChainId } from "@fileonchain/sdk";
import { fetchTxPayloads } from "@/lib/explorer/tx-fetcher";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/explorer/tx/[chainId]/[txHash]` — public API endpoint
 * for the on-demand explorer tx→payload decoder. Decodes the family-
 * specific tx envelope into FileOnChain anchor payload(s) on confirmed
 * transactions.
 *
 * Response shape (200):
 *   { chainId, family, txHash, status, blockHash, blockNumber, timestamp, submitter, anchors }
 *
 * Errors:
 *   400  invalid chainId or txHash shape
 *   404  unknown chain, tx not found, family not wired yet (e.g. substrate)
 *   502  upstream RPC failure (the response body carries the detail)
 *
 * Cache: confirmed/finalized transaction content is immutable, so the
 * response is cached at the edge for 24h with a 7-day stale-while-
 * revalidate window. The detail page fails soft — a 404 leaves the
 * existing txHash row visible and falls back to the indexer DB hit.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chainId: string; txHash: string }> },
) {
  const { chainId, txHash } = await params;
  // The colon in the chain id is URL-encoded as %3A in segments — accept
  // either form so curl users don't have to encode.
  const decodedChainId = decodeURIComponent(chainId) as ChainId;

  const result = await fetchTxPayloads(decodedChainId, txHash);

  if (!result.supported) {
    const status =
      result.reason === "unknown-chain" ||
      result.reason === "tx-not-found" ||
      result.reason === "invalid-tx-hash"
        ? 404
        : 502;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json(result.tx, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
