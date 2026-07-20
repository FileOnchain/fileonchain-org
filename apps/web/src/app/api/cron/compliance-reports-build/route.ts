import { NextResponse } from "next/server";
import { generateMonthlyReportsForAllOrgs } from "@/lib/server/compliance";
import { env } from "@/lib/env";

/**
 * `GET /api/cron/compliance-reports-build` — monthly cron entry that
 * generates the previous calendar month's compliance report for every
 * org with at least one envelope. Same auth pattern as the other
 * crons: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`;
 * absent secret = reject all. Schedule: first of every month at
 * 04:00 UTC (see `apps/web/vercel.json`), so the report covers the
 * just-closed month and finishes before any morning operations call.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = env.cronSecret;
  const authorized =
    !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reportsWritten, orgs } = await generateMonthlyReportsForAllOrgs();
  return NextResponse.json({ ok: true, reportsWritten, orgs });
}
