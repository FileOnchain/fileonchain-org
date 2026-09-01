import { NextResponse } from "next/server";
import type { ChainId } from "@fileonchain/sdk";
import { asRouteError } from "@/lib/auth";
import {
  ingestAnchorTxs,
  isEvmTxHash,
} from "@/lib/indexer/ingest";
import {
  clientIp,
  endpointKey,
  enforceIpRateLimit,
} from "@/lib/server/rate-limit";

/**
 * `POST /api/indexer/ingest` — index the anchor events of freshly
 * landed transactions right away, so the FileOnChain explorer link
 * shown after an upload resolves immediately instead of waiting for
 * the next `/api/cron/indexer-scan` window.
 *
 * Body: `{ chainId: string, txHashes: string[] }`.
 *
 * Deliberately unauthenticated: the request only names a
 * `(chain, txHash)` pointer — every stored field is read back from the
 * chain itself and inserts are idempotent, so the worst a caller can do
 * is make us fetch receipts. That cost is bounded by the per-IP rate
 * limit plus the tx-count cap below.
 */

export const dynamic = "force-dynamic";

/** Upper bound per request — a chunked upload sends one tx per chunk
 *  batch, so a generous cap still covers real uploads in one call. */
const MAX_TX_HASHES = 25;

export async function POST(request: Request) {
  try {
    await enforceIpRateLimit(clientIp(request), endpointKey(request));

    const body = (await request.json().catch(() => null)) as {
      chainId?: unknown;
      txHashes?: unknown;
    } | null;
    const chainId = body?.chainId;
    const txHashes = body?.txHashes;
    if (
      typeof chainId !== "string" ||
      !Array.isArray(txHashes) ||
      txHashes.length === 0 ||
      txHashes.length > MAX_TX_HASHES ||
      !txHashes.every(isEvmTxHash)
    ) {
      return NextResponse.json(
        {
          error: `Expected { chainId, txHashes: [0x… tx hash, ≤${MAX_TX_HASHES}] }`,
          code: "bad_request",
        },
        { status: 400 },
      );
    }

    const results = await ingestAnchorTxs(
      chainId as ChainId,
      txHashes as Array<`0x${string}`>,
    );
    const eventsAdded = results.reduce((acc, r) => acc + r.eventsAdded, 0);
    return NextResponse.json({ ok: true, eventsAdded, results });
  } catch (error) {
    return asRouteError(error);
  }
}
