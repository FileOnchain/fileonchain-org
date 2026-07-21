import { NextResponse } from "next/server";
import { runIndexerScan } from "@/lib/server/indexer";
import { env } from "@/lib/env";

/**
 * `GET /api/cron/indexer-scan` — pulls `CIDAnchored` + `ChunkAnchored`
 * events from every provisioned EVM chain (Sepolia + Auto EVM Chronos
 * today) and upserts them into `indexed_anchor_event`. Scheduled by
 * Vercel Cron (see `apps/web/vercel.json`); guarded by
 * `Authorization: Bearer $CRON_SECRET` so the endpoint is not a public
 * trigger. The same `runIndexerScan()` powers
 * `scripts/indexer-scan.ts` for manual ops runs.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = env.cronSecret;
  const authorized =
    !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await runIndexerScan();
  return NextResponse.json({ ok: true, ...report });
}