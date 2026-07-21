import { NextResponse } from "next/server";
import { sweepExpiredRateLimitWindows } from "@/lib/server/rate-limit-sweep";
import { env } from "@/lib/env";

/**
 * `GET /api/cron/rate-limit-sweep` — deletes every `rate_limit_window`
 * row whose window has been closed for at least two minutes. Scheduled
 * by Vercel Cron (see `apps/web/vercel.json`); guarded by
 * `Authorization: Bearer $CRON_SECRET` so the endpoint is not a public
 * delete trigger. The same `sweepExpiredRateLimitWindows()` powers
 * `scripts/rate-limit-sweep.ts` for manual ops runs.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = env.cronSecret;
  const authorized =
    !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deleted } = await sweepExpiredRateLimitWindows();
  return NextResponse.json({ ok: true, deleted });
}