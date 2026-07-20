import { NextResponse } from "next/server";
import { drainDueDeliveries } from "@/lib/server/webhooks";
import { env } from "@/lib/env";

/**
 * `GET /api/cron/webhooks-drain` — picks up deliveries whose
 * `next_attempt_at < now()` (and that are still under the 5-attempt
 * cap) and dispatches them. Scheduled by Vercel Cron every minute (see
 * `apps/web/vercel.json`); gated on `Authorization: Bearer $CRON_SECRET`
 * so the endpoint is not a public retry trigger.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = env.cronSecret;
  const authorized =
    !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attempted } = await drainDueDeliveries();
  return NextResponse.json({ ok: true, attempted });
}
