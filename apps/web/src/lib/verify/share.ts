import { BADGE_LABEL, BADGE_STYLES, type BadgeStatus } from "@/lib/verify/badge";

/**
 * Link builders for the distribution loop around an envelope that lives
 * at a public URL: the `/verify?url=` page, the `/api/badge?url=` SVG,
 * and the Markdown snippet that puts the badge in a README or release
 * note with a click-through to the report. Client-safe.
 *
 * Everything here keys on the envelope's *URL*, never on a Cloud id —
 * a badge or share link must reproduce the verification from bytes any
 * reader can fetch themselves.
 */

/** `/verify?url=<envelope url>` — the report page for a hosted envelope. */
export const buildUrlShareLink = (envelopeUrl: string, origin: string): string =>
  `${origin}/verify?url=${encodeURIComponent(envelopeUrl)}`;

/** `/api/badge?url=<envelope url>` — the status badge for a hosted envelope. */
export const buildBadgeUrl = (envelopeUrl: string, origin: string): string =>
  `${origin}/api/badge?url=${encodeURIComponent(envelopeUrl)}`;

/**
 * Markdown for a badge that links to the report page. The alt text names
 * the status the badge showed when the snippet was generated, so screen
 * readers and text-only renderers still get a status word; the image
 * itself re-verifies on every fetch.
 */
export const buildBadgeMarkdown = (
  envelopeUrl: string,
  origin: string,
  status: BadgeStatus = "unknown",
): string => {
  const alt = `${BADGE_LABEL}: ${BADGE_STYLES[status].message}`;
  return `[![${alt}](${buildBadgeUrl(envelopeUrl, origin)})](${buildUrlShareLink(envelopeUrl, origin)})`;
};
