import { NextResponse } from "next/server";
import { sweepExpiredEnvelopes } from "@/lib/server/retention";
import { env } from "@/lib/env";
import { isCloudEvidenceEnabled } from "@/lib/server/cloud-feature";

/**
 * `GET /api/cron/retention-sweep` — deletes every stored envelope past its
 * `expires_at`. Scheduled by Vercel Cron (see `vercel.json`), which sends
 * `Authorization: Bearer $CRON_SECRET`. Rejects with 401 when the secret is
 * unset or mismatched, so the endpoint is not a public delete trigger. The
 * same `sweepExpiredEnvelopes()` powers `scripts/retention-sweep.ts` for
 * manual ops runs.
 *
 * Bails fast with `{ skipped: "flag_off" }` when the Cloud evidence
 * surface is disabled — defence in depth so a misconfigured schedule
 * cannot quietly delete rows under a feature that's been turned off.
 * (The sweep path itself only touches `evidence_envelope` rows; nothing
 * to delete when the flag is off, but the no-op is reported so ops can
 * tell "feature closed" apart from "no eligible rows".)
 */

// Deletes rows — must never be statically cached / prerendered.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = env.cronSecret;
  const authorized =
    !!secret &&
    request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCloudEvidenceEnabled()) {
    return NextResponse.json({ ok: true, skipped: "flag_off" });
  }

  const { deleted } = await sweepExpiredEnvelopes();
  return NextResponse.json({ ok: true, deleted });
}
