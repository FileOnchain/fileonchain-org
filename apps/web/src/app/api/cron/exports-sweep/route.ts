import { NextResponse } from "next/server";
import { sweepExpiredExportJobs } from "@/lib/server/exports";
import { env } from "@/lib/env";
import { isCloudExportsEnabled } from "@/lib/server/cloud-feature";

/**
 * `GET /api/cron/exports-sweep` — deletes every export_job whose
 * `expires_at < now()` and removes its server-local file. Scheduled by
 * Vercel Cron (`apps/web/vercel.json`, 03:37 UTC). Same auth pattern
 * as `retention-sweep` and `webhooks-drain`: Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; absent secret = reject all.
 *
 * Bails fast with `{ skipped: "flag_off" }` when the bulk-export
 * feature is disabled — the sweep is a no-op when no jobs can be
 * created, but we report the no-op so ops can tell the surface closed
 * apart from "no eligible rows".
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = env.cronSecret;
  const authorized =
    !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCloudExportsEnabled()) {
    return NextResponse.json({ ok: true, skipped: "flag_off" });
  }

  const { deleted } = await sweepExpiredExportJobs();
  return NextResponse.json({ ok: true, deleted });
}
