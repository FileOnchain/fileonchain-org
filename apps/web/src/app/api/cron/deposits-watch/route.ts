import { NextResponse } from "next/server";
import { runDepositWatch } from "@/lib/server/deposits";
import { env } from "@/lib/env";

/**
 * `GET /api/cron/deposits-watch` — confirms pending USDC deposits by
 * scanning the `Transfer` event stream on every EVM chain whose
 * `usdcContract` is provisioned (currently Sepolia + Auto EVM Chronos
 * — both share the same MockUSDC). Scheduled by Vercel Cron (see
 * `apps/web/vercel.json`); guarded by `Authorization: Bearer
 * $CRON_SECRET` so the endpoint is not a public trigger. The same
 * `runDepositWatch()` powers `scripts/deposits-watch.ts` for manual
 * ops runs.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = env.cronSecret;
  const authorized =
    !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await runDepositWatch();
  return NextResponse.json({ ok: true, ...report });
}