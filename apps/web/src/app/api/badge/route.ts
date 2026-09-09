import { renderStatusBadge } from "@/lib/verify/badge";
import { RemoteEnvelopeError, verifyRemoteEnvelope } from "@/lib/server/remote-envelope";

export const dynamic = "force-dynamic";

/**
 * `GET /api/badge?url=<envelope url>` — a shields.io-style SVG whose
 * message and colour are the *locally computed* verifier status of the
 * envelope at that URL: `valid`, `valid, warnings`, `incomplete`,
 * `invalid`. `?envelope=<base64url>` carries a small envelope inline.
 *
 * When the verifier could not run — the URL is not public, does not
 * answer, or the parameter is malformed — the badge says `unreachable`
 * or `unknown` in grey. It never falls back to a hopeful colour, and it
 * always answers 200 with an image so a README never shows a broken
 * picture in place of an honest status.
 *
 * Pair it with `/verify?url=<same url>` as the click-through so a reader
 * can reproduce the verification in their own browser (see
 * `lib/verify/share.ts` for the Markdown snippet).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let svg: string;
  let cache = "public, max-age=300, s-maxage=300, stale-while-revalidate=600";
  try {
    const { summary } = await verifyRemoteEnvelope(params);
    svg = renderStatusBadge(summary.status);
  } catch (err) {
    svg = renderStatusBadge(err instanceof RemoteEnvelopeError ? err.badge : "unknown");
    cache = "public, max-age=60, s-maxage=60";
  }
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": cache,
      // The status is derived from the fetched bytes every time.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
