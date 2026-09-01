import { NextResponse } from "next/server";
import { CID } from "@autonomys/auto-dag-data";
import { sha256 } from "multiformats/hashes/sha2";
import { base64ToBytes, isValidCID } from "@fileonchain/sdk";
import { getChunkPayload } from "@/lib/indexer/queries";

export const dynamic = "force-dynamic";

/** Must match the upload-side chunk CID derivation in
 *  `src/utils/generateCIDs.ts` — CIDv1, sha2-256 codec, over raw bytes. */
const SHA2_256_CODEC = 0x12;
const CID_VERSION = 1;

/**
 * `GET /api/v1/explorer/chunk/[cid]?file=<fileCid>` — the content read
 * behind the explorer's chunk detail view. Resolves one chunk CID to
 * its indexed anchor payload and, when the anchor embedded the bytes
 * (`d`), returns them base64-encoded together with a `verified` flag:
 * the CID is recomputed from the decoded bytes server-side, so a
 * payload whose data does not hash back to the CID it claims is
 * reported as unverified rather than rendered as authentic content.
 *
 * Response shape (200):
 *   { chunkCid, fileCid, index, total, nextCid, chainId, txHash,
 *     blockNumber, timestamp, submitter, hasData, sizeBytes,
 *     dataBase64, verified }
 *
 * Errors:
 *   400  malformed CID
 *   404  chunk never indexed (or not part of ?file=)
 *
 * Cache: only verified content is immutable by construction (the CID
 * pins the bytes), so only that case gets the long edge cache.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const { cid } = await params;
  const chunkCid = decodeURIComponent(cid);
  if (!isValidCID(chunkCid)) {
    return NextResponse.json({ error: "invalid-cid" }, { status: 400 });
  }
  const fileParam = new URL(request.url).searchParams.get("file") ?? undefined;
  if (fileParam !== undefined && !isValidCID(fileParam)) {
    return NextResponse.json({ error: "invalid-file-cid" }, { status: 400 });
  }

  const row = await getChunkPayload(chunkCid, fileParam);
  if (!row) {
    return NextResponse.json({ error: "chunk-not-found" }, { status: 404 });
  }

  let sizeBytes = 0;
  let verified = false;
  if (row.dataBase64) {
    try {
      const bytes = base64ToBytes(row.dataBase64);
      sizeBytes = bytes.length;
      const recomputed = CID.create(
        CID_VERSION,
        SHA2_256_CODEC,
        await sha256.digest(bytes),
      );
      verified = recomputed.toString() === row.chunkCid;
    } catch {
      // Undecodable base64: report the payload as carrying no usable data.
      return NextResponse.json(
        { ...row, hasData: false, dataBase64: null, sizeBytes: 0, verified: false },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  return NextResponse.json(
    { ...row, hasData: row.dataBase64 !== null, sizeBytes, verified },
    {
      headers: {
        // Verified bytes are pinned by the CID itself — safe to cache hard.
        "Cache-Control": verified
          ? "public, s-maxage=86400, stale-while-revalidate=604800"
          : "no-store",
      },
    },
  );
}
