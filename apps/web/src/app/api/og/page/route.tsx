import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";
import { OG_IMAGE_SIZE, OG_SUBTITLE_MAX, OG_TITLE_MAX } from "@/lib/seo";

/**
 * `GET /api/og/page?title=<page title>&subtitle=<one line>` — the share
 * card `pageMetadata()` points every public page's `og:image` at. Same
 * frame as the root `opengraph-image.tsx`, with the page's own title in
 * place of the site headline so link previews name the page they open.
 *
 * Text is capped to the lengths `lib/seo.ts` exports and painted verbatim
 * (ImageResponse escapes it), so the route stays static-cacheable and
 * carries no data beyond what the query says.
 */

export const dynamic = "force-dynamic";

const clean = (value: string | null, max: number) =>
  (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const title = clean(params.get("title"), OG_TITLE_MAX) || siteConfig.name;
  const subtitle = clean(params.get("subtitle"), OG_SUBTITLE_MAX);
  const long = title.length > 40;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0d12",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "#5e8bff",
            }}
          />
          <div style={{ fontSize: "40px", fontWeight: 700, color: "#f4f2ec" }}>
            {siteConfig.name}
          </div>
        </div>

        {/* Page title + one-line summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              fontSize: long ? "56px" : "72px",
              fontWeight: 800,
              color: "#f4f2ec",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              maxWidth: "1040px",
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                fontSize: "28px",
                color: "#9aa3b2",
                maxWidth: "960px",
                lineHeight: 1.35,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "22px" }}>
          <div style={{ color: "#c7cdd9" }}>{siteConfig.url.replace(/^https?:\/\//, "")}</div>
          <div style={{ color: "#3a3f4a" }}>·</div>
          <div style={{ color: "#6b7280" }}>Open protocol, local verifier, hash-only by default.</div>
        </div>
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
