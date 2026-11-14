import type { MetadataRoute } from "next";
import { loadPosts } from "@/lib/blog/load";
import { loadChangelog } from "@/lib/changelog/load";
import { PUBLIC_PAGES } from "@/lib/public-pages";
import { siteConfig } from "@/lib/site";

const dayToDate = (day: string): Date => new Date(`${day}T00:00:00Z`);

/**
 * Sitemap for the public pages (`lib/public-pages.ts`, shared with
 * `llms.txt`) plus every published blog post.
 *
 * `lastmod` is only emitted where the repo holds a real date: blog posts
 * (frontmatter), the blog index (newest post), and the changelog (newest
 * dated release). Stamping every URL with the build time made the field
 * meaningless, and search engines ignore a `lastmod` they learn not to trust.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = (await loadPosts()).filter((post) => !post.draft);
  const newestPost = posts
    .map((post) => post.updated ?? post.date)
    .sort()
    .at(-1);
  const newestRelease = (await loadChangelog()).releases
    .map((release) => release.date)
    .filter((date): date is string => date !== null)
    .sort()
    .at(-1);

  const knownDates: Record<string, string | undefined> = {
    "/blog": newestPost,
    "/changelog": newestRelease,
  };

  const pages: MetadataRoute.Sitemap = PUBLIC_PAGES.map(({ path, priority, changeFrequency }) => {
    const day = knownDates[path];
    return {
      url: `${siteConfig.url}${path}`,
      ...(day ? { lastModified: dayToDate(day) } : {}),
      changeFrequency,
      priority,
    };
  });

  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${siteConfig.url}/blog/${post.slug}`,
    lastModified: dayToDate(post.updated ?? post.date),
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  return [...pages, ...postEntries];
}
