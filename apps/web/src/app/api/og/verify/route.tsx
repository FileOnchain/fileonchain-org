import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";
import type { ReportSummary } from "@/lib/verify/summary";
import { RemoteEnvelopeError, verifyRemoteEnvelope } from "@/lib/server/remote-envelope";

export const dynamic = "force-dynamic";

/**
 * `GET /api/og/verify?url=<envelope url>` — the social card for a
 * `/verify?url=` link. Runs the offline verifier on the envelope at
 * that URL and paints its result: the status stamp (never a single
 * green "verified"), the check tally, receipts per kind, the settlement
 * systems, and artifact vs envelope signer counts kept visibly apart.
 *
 * `/verify`'s `generateMetadata` points `og:image` here whenever the
 * page is opened with `?url=` or `?envelope=`. Failures render a card
 * that says what went wrong rather than a generic one.
 */

const SIZE = { width: 1200, height: 630 } as const;

const STAMP: Record<ReportSummary["status"] | "unknown" | "unreachable", { bg: string; fg: string }> = {
  valid: { bg: "#1f8a4c", fg: "#f4f2ec" },
  "valid-with-warnings": { bg: "#b58a1a", fg: "#0b0d12" },
  incomplete: { bg: "#2b6cb0", fg: "#f4f2ec" },
  invalid: { bg: "#b03a2e", fg: "#f4f2ec" },
  unknown: { bg: "#3a3f4a", fg: "#c7cdd9" },
  unreachable: { bg: "#3a3f4a", fg: "#c7cdd9" },
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      minWidth: "220px",
      padding: "18px 22px",
      border: "1px solid #2a2f3a",
      borderRadius: "16px",
      background: "#12151c",
    }}
  >
    <div style={{ fontSize: "20px", color: "#9aa3b2", letterSpacing: "0.02em" }}>{label}</div>
    <div style={{ fontSize: "34px", fontWeight: 700, color: "#f4f2ec" }}>{value}</div>
  </div>
);

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      height: "100%",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      background: "#0b0d12",
      padding: "64px 72px",
      fontFamily: "sans-serif",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
      <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "#5e8bff" }} />
      <div style={{ fontSize: "32px", fontWeight: 700, color: "#f4f2ec" }}>{siteConfig.name}</div>
      <div style={{ fontSize: "24px", color: "#9aa3b2", marginLeft: "8px" }}>· evidence report</div>
    </div>
    {children}
    <div style={{ fontSize: "20px", color: "#6b7280" }}>
      Result of the open verifier, offline checks only. An envelope proves existence, integrity,
      signing keys, and timing — not truth or authorship.
    </div>
  </div>
);

const ReportCard = ({ summary }: { summary: ReportSummary }) => {
  const stamp = STAMP[summary.status];
  const systems =
    summary.settlementSystems.length > 0 ? summary.settlementSystems.join(", ") : "none";
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div
            style={{
              display: "flex",
              padding: "14px 28px",
              borderRadius: "999px",
              background: stamp.bg,
              color: stamp.fg,
              fontSize: "44px",
              fontWeight: 800,
              letterSpacing: "-0.01em",
            }}
          >
            {summary.statusLabel}
          </div>
          <div style={{ fontSize: "26px", color: "#9aa3b2" }}>
            {`${summary.checks.total} checks · ${summary.checks.pass} pass · ${summary.checks.fail} fail · ${summary.checks.warning + summary.checks.unknown} warning/unknown`}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
          <Stat label="Artifact signatures" value={String(summary.artifactSigners)} />
          <Stat label="Envelope signatures" value={String(summary.envelopeSigners)} />
          <Stat label="Receipts" value={String(summary.receipts.total)} />
          <Stat label="Settlement systems" value={systems} />
        </div>
        {summary.subject.sha256 && (
          <div style={{ display: "flex", fontSize: "20px", color: "#9aa3b2" }}>
            {`subject sha256 ${summary.subject.sha256.slice(0, 16)}… · ${summary.profile ? `profile ${summary.profile}` : "no application profile"}`}
          </div>
        )}
      </div>
    </Frame>
  );
};

const ErrorCard = ({ badge, reason }: { badge: "unknown" | "unreachable"; reason: string }) => {
  const stamp = STAMP[badge];
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            padding: "14px 28px",
            borderRadius: "999px",
            background: stamp.bg,
            color: stamp.fg,
            fontSize: "44px",
            fontWeight: 800,
          }}
        >
          {badge === "unreachable" ? "Envelope unreachable" : "No result"}
        </div>
        <div style={{ fontSize: "28px", color: "#c7cdd9", maxWidth: "980px" }}>
          {`The verifier could not run on this link: ${reason}. Open the page to try in your browser.`}
        </div>
      </div>
    </Frame>
  );
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let element: React.ReactElement;
  let cache = "public, max-age=300, s-maxage=300, stale-while-revalidate=600";
  try {
    const { summary } = await verifyRemoteEnvelope(params);
    element = <ReportCard summary={summary} />;
  } catch (err) {
    const badge = err instanceof RemoteEnvelopeError ? err.badge : "unknown";
    const reason = err instanceof Error ? err.message : "unexpected error";
    element = <ErrorCard badge={badge} reason={reason} />;
    cache = "public, max-age=60, s-maxage=60";
  }
  return new ImageResponse(element, {
    ...SIZE,
    headers: { "Cache-Control": cache },
  });
}
