import type { MetadataRoute } from "next";
import { loadPosts } from "@/lib/blog/load";
import { siteConfig } from "@/lib/site";

/**
 * Static sitemap for the public marketing + app surfaces. `/dashboard` is
 * intentionally omitted — it's a per-user view marked `noindex`. Per-CID
 * explorer pages are excluded too; they're unbounded and better surfaced
 * through the indexer once real data is wired. Published blog posts are
 * listed individually, dated by their own frontmatter.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/upload-file", priority: 0.9, changeFrequency: "weekly" },
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
    { path: "/changelog", priority: 0.6, changeFrequency: "weekly" },
    { path: "/blog", priority: 0.6, changeFrequency: "weekly" },
  ];

  // Evaluated at build time, so lastModified tracks the deploy — the
  // strongest freshness signal we can give without per-route data.
  const lastModified = new Date();

  const pages: MetadataRoute.Sitemap = routes.map(({ path, priority, changeFrequency }) => ({
    url: `${siteConfig.url}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));

  const posts: MetadataRoute.Sitemap = (await loadPosts())
    .filter((post) => !post.draft)
    .map((post) => ({
      url: `${siteConfig.url}/blog/${post.slug}`,
      lastModified: new Date(`${post.updated ?? post.date}T00:00:00Z`),
      changeFrequency: "yearly",
      priority: 0.5,
    }));

  return [...pages, ...posts];
}
