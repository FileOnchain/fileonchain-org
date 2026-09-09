import type { VerificationStatus } from "@fileonchain/verify";

/**
 * "Evidence: <status>" SVG badge — shields.io-style flat badge rendered
 * by `GET /api/badge`. Pure string building, no DOM, so it is unit-tested
 * and can be rendered in a route handler or a test alike.
 *
 * The message is the *locally computed* verifier status, word for word
 * the same as the report chip on `/verify`. There is deliberately no
 * "verified" wording: an envelope is valid, valid with warnings,
 * incomplete, or invalid — and when the badge could not run the verifier
 * at all it says so (`unknown` / `unreachable`) instead of guessing.
 */

export type BadgeStatus = VerificationStatus | "unknown" | "unreachable";

export const BADGE_LABEL = "FileOnChain evidence";

/** Message text + right-hand colour per status (shields.io palette). */
export const BADGE_STYLES: Record<BadgeStatus, { message: string; color: string }> = {
  valid: { message: "valid", color: "#4c1" },
  "valid-with-warnings": { message: "valid, warnings", color: "#dfb317" },
  incomplete: { message: "incomplete", color: "#007ec6" },
  invalid: { message: "invalid", color: "#e05d44" },
  unknown: { message: "unknown", color: "#9f9f9f" },
  unreachable: { message: "unreachable", color: "#9f9f9f" },
};

const LABEL_COLOR = "#555";

/**
 * Approximate Verdana 11px advance widths. The SVG pins the rendered
 * width with `textLength`, so this only has to be close enough for the
 * box to look right — the same approach shields.io takes.
 */
const charWidth = (ch: string): number => {
  if (/[ .,:;'|!il]/.test(ch)) return 3.6;
  if (/[fjrt\-()[\]{}]/.test(ch)) return 4.4;
  if (/[mwMW@]/.test(ch)) return 10.4;
  if (/[A-Z]/.test(ch)) return 8;
  if (/[0-9]/.test(ch)) return 7;
  return 6.6;
};

export const measureText = (text: string): number =>
  Math.round(Array.from(text).reduce((w, ch) => w + charWidth(ch), 0));

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export interface RenderBadgeOptions {
  label?: string;
  message: string;
  color: string;
}

/** Render a flat two-segment badge as an SVG document string. */
export const renderBadgeSvg = ({ label = BADGE_LABEL, message, color }: RenderBadgeOptions): string => {
  const pad = 5;
  const labelWidth = measureText(label) + pad * 2;
  const messageWidth = measureText(message) + pad * 2;
  const width = labelWidth + messageWidth;
  const title = `${label}: ${message}`;
  const labelX = labelWidth / 2;
  const messageX = labelWidth + messageWidth / 2;
  // Text coordinates are ×10 and scaled down (shields' trick for crisp
  // sub-pixel placement).
  const text = (x: number, content: string, textLength: number) =>
    `<text aria-hidden="true" x="${x * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${textLength * 10}">${escapeXml(content)}</text>` +
    `<text x="${x * 10}" y="140" transform="scale(.1)" fill="#fff" textLength="${textLength * 10}">${escapeXml(content)}</text>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
    `<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>` +
    `<g clip-path="url(#r)">` +
    `<rect width="${labelWidth}" height="20" fill="${LABEL_COLOR}"/>` +
    `<rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>` +
    `<rect width="${width}" height="20" fill="url(#s)"/>` +
    `</g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">` +
    text(labelX, label, labelWidth - pad * 2) +
    text(messageX, message, messageWidth - pad * 2) +
    `</g></svg>`
  );
};

/** Render the badge for a verifier status (or a non-result state). */
export const renderStatusBadge = (status: BadgeStatus): string =>
  renderBadgeSvg(BADGE_STYLES[status]);
