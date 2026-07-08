import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/api-keys";
import {
  anchorWithAccount,
  parseAnchorPayload,
  serializeJob,
  AnchorRequestError,
} from "@/lib/server/anchor-service";

/**
 * Programmatic anchoring against account credits (or a BYOK key):
 *
 *   curl -X POST https://fileonchain.org/api/v1/anchor \
 *     -H "Authorization: Bearer fok_…" \
 *     -H "Content-Type: application/json" \
 *     -d '{"cid":"bafy…","fileName":"data.bin","fileSizeBytes":150000,
 *          "chunkCount":3,"chainIds":["evm:8453"],
 *          "paymentMethod":"credits"}'
 */
export async function POST(request: Request) {
  const apiKey = await authenticateApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    const payload = parseAnchorPayload(body);
    const job = await anchorWithAccount(
      { userId: apiKey.userId, apiKeyId: apiKey.id, source: "api" },
      payload,
    );
    return NextResponse.json({ job: serializeJob(job) });
  } catch (error) {
    if (error instanceof AnchorRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
