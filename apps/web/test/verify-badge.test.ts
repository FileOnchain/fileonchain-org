import { describe, expect, it } from "vitest";
import {
  BADGE_LABEL,
  BADGE_STYLES,
  measureText,
  renderBadgeSvg,
  renderStatusBadge,
  type BadgeStatus,
} from "@/lib/verify/badge";
import { buildBadgeMarkdown, buildBadgeUrl, buildUrlShareLink } from "@/lib/verify/share";

/**
 * The badge is the most-copied artifact of the distribution loop, so
 * its wording is pinned here: every status maps to a message the
 * verifier itself would print, and "verified" never appears.
 */

const STATUSES: BadgeStatus[] = [
  "valid",
  "valid-with-warnings",
  "incomplete",
  "invalid",
  "unknown",
  "unreachable",
];

describe("status badge", () => {
  it.each(STATUSES)("renders a well-formed SVG for %s", (status) => {
    const svg = renderStatusBadge(status);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain(`<title>${BADGE_LABEL}: ${BADGE_STYLES[status].message}</title>`);
    expect(svg).toContain(`fill="${BADGE_STYLES[status].color}"`);
    expect(svg.toLowerCase()).not.toContain("verified");
  });

  it("gives non-results a grey badge, never a hopeful colour", () => {
    expect(BADGE_STYLES.unknown.color).toBe(BADGE_STYLES.unreachable.color);
    expect(BADGE_STYLES.unknown.color).not.toBe(BADGE_STYLES.valid.color);
  });

  it("sizes the box from the text and pins the rendered width", () => {
    const svg = renderBadgeSvg({ label: "a", message: "bb", color: "#000" });
    const width = Number(svg.match(/width="(\d+)" height="20"/)?.[1]);
    expect(width).toBe(measureText("a") + measureText("bb") + 20);
    expect(svg).toContain(`textLength="${measureText("a") * 10}"`);
    expect(svg).toContain(`textLength="${measureText("bb") * 10}"`);
  });

  it("escapes XML in the text", () => {
    const svg = renderBadgeSvg({ label: "<x>", message: 'a"b&c', color: "#000" });
    expect(svg).toContain("&lt;x&gt;");
    expect(svg).toContain("a&quot;b&amp;c");
    expect(svg).not.toContain("<x>");
  });
});

describe("share links", () => {
  const envelope = "https://example.com/releases/download/v1/evidence.json";
  const origin = "https://fileonchain.org";

  it("keys every link on the envelope URL", () => {
    const encoded = encodeURIComponent(envelope);
    expect(buildUrlShareLink(envelope, origin)).toBe(`${origin}/verify?url=${encoded}`);
    expect(buildBadgeUrl(envelope, origin)).toBe(`${origin}/api/badge?url=${encoded}`);
  });

  it("builds a badge that links to the report page", () => {
    const md = buildBadgeMarkdown(envelope, origin, "valid-with-warnings");
    expect(md).toBe(
      `[![${BADGE_LABEL}: valid, warnings](${buildBadgeUrl(envelope, origin)})](${buildUrlShareLink(envelope, origin)})`,
    );
    expect(md.toLowerCase()).not.toContain("verified");
  });
});
