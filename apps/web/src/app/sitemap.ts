import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

/**
 * Static sitemap for the public marketing + app surfaces. `/dashboard` is
 * intentionally omitted — it's a per-user view marked `noindex`. Per-CID
 * explorer pages are excluded too; they're unbounded and better surfaced
 * through the indexer once real data is wired.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/agent-evidence", priority: 0.9, changeFrequency: "weekly" },
    { path: "/verify", priority: 0.8, changeFrequency: "monthly" },
    { path: "/cloud", priority: 0.7, changeFrequency: "weekly" },
    { path: "/integrations", priority: 0.7, changeFrequency: "weekly" },
    { path: "/explorer", priority: 0.8, changeFrequency: "hourly" },
    { path: "/leaderboard", priority: 0.7, changeFrequency: "daily" },
    { path: "/cache", priority: 0.7, changeFrequency: "weekly" },
    { path: "/donations", priority: 0.6, changeFrequency: "weekly" },
    { path: "/protocol", priority: 0.7, changeFrequency: "weekly" },
    { path: "/whitepaper", priority: 0.7, changeFrequency: "monthly" },
    { path: "/docs", priority: 0.7, changeFrequency: "weekly" },
  ];

  // Evaluated at build time, so lastModified tracks the deploy — the
  // strongest freshness signal we can give without per-route data.
  const lastModified = new Date();

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${siteConfig.url}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
