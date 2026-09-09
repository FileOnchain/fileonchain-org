import { ImageResponse } from "next/og";
import { ACTIVE_CHAINS } from "@fileonchain/sdk";
import { siteConfig } from "@/lib/site";

// Default social share card for every route that doesn't supply its own.
// Twitter's summary_large_image falls back to this og:image too.
export const alt = siteConfig.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Only networks open for anchoring — the registry's `status: "active"`
// set — so the card never describes a network beyond its integration
// status. Testnets keep their full name ("Ethereum Sepolia").
const CHAINS = Array.from(new Set(ACTIVE_CHAINS.map((c) => c.name)));

export default function OpengraphImage() {
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
            FileOnChain
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              fontSize: "68px",
              fontWeight: 800,
              color: "#f4f2ec",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              maxWidth: "1000px",
            }}
          >
            Seal any file or agent run. Anyone can verify it.
          </div>
          <div style={{ fontSize: "28px", color: "#9aa3b2", maxWidth: "960px", lineHeight: 1.35 }}>
            A document, a release, a full AI-agent run — one portable evidence
            package. Open protocol, local verifier, hash-only by default.
          </div>
        </div>

        {/* Chain row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {CHAINS.map((c) => (
            <div
              key={c}
              style={{
                display: "flex",
                fontSize: "22px",
                color: "#c7cdd9",
                border: "1px solid #2a2f3a",
                borderRadius: "999px",
                padding: "8px 20px",
              }}
            >
              {c}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
