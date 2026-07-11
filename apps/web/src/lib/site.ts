/**
 * Single source of truth for site-wide SEO / metadata constants.
 *
 * `NEXT_PUBLIC_SITE_URL` lets deploy previews and staging override the
 * canonical origin; production falls back to the primary domain. Keep the
 * value origin-only (no trailing slash) — `metadataBase` and `sitemap.ts`
 * both resolve relative paths against it.
 */
export const siteConfig = {
  name: "FileOnChain",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://fileonchain.org").replace(
    /\/$/,
    ""
  ),
  title: "FileOnChain — Verifiable Onchain Evidence Packages",
  description:
    "One developer interface that creates portable, independently verifiable evidence packages across storage and settlement systems — one SDK, API, and MCP server; twelve chain families behind it.",
  ogDescription:
    "One developer interface. Portable, independently verifiable evidence packages across storage and settlement systems.",
  twitter: "@fileonchain",
  /** Public profiles — Organization JSON-LD `sameAs` and footer links. */
  socials: {
    twitter: "https://x.com/fileonchain",
    github: "https://github.com/FileOnchain",
  },
} as const;

/** Google Analytics 4 measurement id (e.g. `G-XXXXXXXXXX`), empty when unset. */
export const gaId = process.env.NEXT_PUBLIC_GA_ID ?? "";

/**
 * Google Search Console verification token (the `content` value of the
 * `google-site-verification` meta tag). Read on the server at render time, so
 * it doesn't need the `NEXT_PUBLIC_` prefix. Empty → no tag emitted.
 */
export const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION ?? "";
