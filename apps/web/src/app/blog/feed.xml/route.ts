import { loadPosts } from "@/lib/blog/load";
import { blocksToHtml } from "@/lib/blog/parse";
import { siteConfig } from "@/lib/site";

/**
 * RSS 2.0 feed for `/blog`, one item per published post with the full
 * body. Built from the same parse as the pages, at build time.
 */
export const dynamic = "force-static";

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const rfc822 = (isoDate: string): string => new Date(`${isoDate}T00:00:00Z`).toUTCString();

export async function GET(): Promise<Response> {
  const posts = (await loadPosts()).filter((post) => !post.draft);
  const pageUrl = `${siteConfig.url}/blog`;
  const feedUrl = `${pageUrl}/feed.xml`;

  const items = posts
    .map((post) => {
      const link = `${pageUrl}/${post.slug}`;
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${rfc822(post.date)}</pubDate>`,
        ...post.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
        `      <description>${escapeXml(`<p>${escapeXml(post.description)}</p>${blocksToHtml(post.blocks, siteConfig.url)}`)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const lastBuildDate = posts[0] ? rfc822(posts[0].date) : new Date().toUTCString();

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(`${siteConfig.name} blog`)}</title>`,
    `    <link>${escapeXml(pageUrl)}</link>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    `    <description>${escapeXml(
      "Notes from building FileOnChain: the Evidence Protocol, the Agent Evidence Profile, and the open verifier.",
    )}</description>`,
    "    <language>en</language>",
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    ...(items ? [items] : []),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
