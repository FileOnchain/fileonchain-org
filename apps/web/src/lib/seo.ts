import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

/**
 * Per-page metadata builder.
 *
 * Next.js merges `metadata` shallowly per top-level key: a page that sets
 * its own `openGraph` or `twitter` block replaces the root layout's block
 * wholesale, including the share image the root `opengraph-image.tsx`
 * contributes. Every page that hand-rolled those blocks therefore shipped
 * with no `og:image` at all. Building the whole block here keeps the
 * title, description, canonical, and a page-specific card in one place.
 */

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** Longest title / subtitle the card route will paint; longer text is cut. */
export const OG_TITLE_MAX = 90;
export const OG_SUBTITLE_MAX = 200;

/** Absolute URL of the generated share card for a page (see `api/og/page`). */
export function pageOgImageUrl(title: string, subtitle?: string): string {
  const query = new URLSearchParams({ title: title.slice(0, OG_TITLE_MAX) });
  if (subtitle) query.set("subtitle", subtitle.slice(0, OG_SUBTITLE_MAX));
  return `${siteConfig.url}/api/og/page?${query.toString()}`;
}

export interface PageMetadataInput {
  /** Short page title; the root template appends "· FileOnChain". */
  title: string;
  /** Search-snippet description (aim for roughly 150 characters). */
  description: string;
  /** Canonical path, e.g. `"/verify"`. Always absolute against `siteConfig.url`. */
  path: string;
  /** Shorter copy for link previews; defaults to `description`. */
  socialDescription?: string;
  /** Open Graph object type; defaults to `"website"`. */
  ogType?: "website" | "article" | "profile";
  /** Set `false` for pages that must not be indexed (crawlers still follow links). */
  index?: boolean;
}

export function pageMetadata({
  title,
  description,
  path,
  socialDescription = description,
  ogType = "website",
  index = true,
}: PageMetadataInput): Metadata {
  const fullTitle = `${title} · ${siteConfig.name}`;
  const url = `${siteConfig.url}${path}`;
  const image = {
    url: pageOgImageUrl(title, socialDescription),
    ...OG_IMAGE_SIZE,
    alt: fullTitle,
  };
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title: fullTitle,
      description: socialDescription,
      url,
      siteName: siteConfig.name,
      locale: "en_US",
      type: ogType,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      site: siteConfig.twitter,
      creator: siteConfig.twitter,
      title: fullTitle,
      description: socialDescription,
      images: [image.url],
    },
  };
}
