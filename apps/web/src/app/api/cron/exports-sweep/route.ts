import { NextResponse } from "next/server";
import { sweepExpiredExportJobs } from "@/lib/server/exports";
import { env } from "@/lib/env";

/**
 * `GET /api/cron/exports-sweep` — deletes every export_job whose
 * `expires_at < now()` and removes its server-local file. Scheduled by
 * Vercel Cron (`apps/web/vercel.json`, 03:37 UTC). Same auth pattern
 * as `retention-sweep` and `webhooks-drain`: Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; absent secret = reject all.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = env.cronSecret;
  const authorized =
    !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deleted } = await sweepExpiredExportJobs();
  return NextResponse.json({ ok: true, deleted });
}
