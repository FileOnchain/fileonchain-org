import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Build stamp for the client-side VersionWatcher. `NEXT_PUBLIC_BUILD_ID` is
 * inlined at build time (next.config.ts), so this always reports the id of
 * the deployment actually serving traffic — clients built from an older
 * deploy see a mismatch and prompt for a refresh.
 */
export const GET = () =>
  NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
