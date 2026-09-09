import { NextResponse } from "next/server";
import { getSocialProof } from "@/lib/server/social-proof";

/**
 * GET /api/social-proof: GitHub stars and npm weekly downloads for the
 * footer pills. The upstream calls are made server-side and held in the
 * Next data cache for an hour (`lib/server/social-proof.ts`); the CDN
 * caches the response for the same hour so a page view never reaches
 * GitHub or npm directly. Keeping the fetch out of the root layout is
 * deliberate: it leaves every static page fully static instead of
 * turning the whole site into hourly ISR for one footer widget.
 */
export async function GET(): Promise<NextResponse> {
  const proof = await getSocialProof();
  return NextResponse.json(proof, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
