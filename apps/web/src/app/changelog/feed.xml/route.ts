import { loadChangelog } from "@/lib/changelog/load";
import { releaseToHtml } from "@/lib/changelog/parse";
import { siteConfig } from "@/lib/site";

/**
 * RSS 2.0 feed for `/changelog`, one item per dated release. Built from
 * the same `CHANGELOG.md` parse as the page, at build time; the
 * `Unreleased` section is left out because it has no publication date.
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
  const { releases } = await loadChangelog();
  const pageUrl = `${siteConfig.url}/changelog`;
  const feedUrl = `${pageUrl}/feed.xml`;
  const dated = releases.filter((r): r is typeof r & { date: string } => r.date !== null);

  const items = dated
    .map((release) => {
      const link = `${pageUrl}#${release.slug}`;
      const title = release.title === release.date ? `Changes on ${release.date}` : `${release.title} (${release.date})`;
      const areas = release.sections.map((s) => s.title).join(", ");
      return [
        "    <item>",
        `      <title>${escapeXml(`${siteConfig.name}: ${title}`)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${rfc822(release.date)}</pubDate>`,
        ...(areas ? [`      <category>${escapeXml(areas)}</category>`] : []),
        `      <description>${escapeXml(releaseToHtml(release, siteConfig.repo))}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const lastBuildDate = dated[0] ? rfc822(dated[0].date) : new Date().toUTCString();

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(`${siteConfig.name} changelog`)}</title>`,
    `    <link>${escapeXml(pageUrl)}</link>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    `    <description>${escapeXml(
      "Releases of the FileOnChain Evidence Protocol, the Agent Evidence Profile, the reference implementations, and the webapp.",
    )}</description>`,
    "    <language>en</language>",
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    items,
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
