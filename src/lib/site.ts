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
  title: "FileOnChain — Multichain Onchain Storage",
  description:
    "Upload files permanently to Autonomys, Ethereum, Base, Optimism, Arbitrum, Polygon, Solana, and Aptos. Anchor CIDs onchain. Pay for private cache. Donate to keep public cache alive.",
  ogDescription:
    "Permanent onchain file storage across 10 chains. Anchor CIDs, pay for private cache, support public infrastructure.",
  twitter: "@fileonchain",
} as const;

/** Google Analytics 4 measurement id (e.g. `G-XXXXXXXXXX`), empty when unset. */
export const gaId = process.env.NEXT_PUBLIC_GA_ID ?? "";
