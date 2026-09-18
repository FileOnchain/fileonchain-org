import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

/**
 * Allow crawling everything except the per-user dashboard and API routes,
 * and point crawlers at the sitemap. The share cards and the status badge
 * live under `/api/` but must stay fetchable: Twitterbot and friends honor
 * robots.txt when they fetch `og:image`, so a blanket `/api/` block would
 * strip the image from every link preview.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/og/", "/api/badge"],
      disallow: ["/dashboard", "/api/"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
