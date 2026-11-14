import { siteConfig } from "@/lib/site";

/**
 * Shared schema.org vocabulary. The root layout emits the Organization and
 * WebSite nodes once; page-level JSON-LD links to them by `@id` instead of
 * repeating them, so search engines and answer engines resolve every page
 * to the same publisher entity.
 */
export const ORGANIZATION_ID = `${siteConfig.url}/#organization`;
export const WEBSITE_ID = `${siteConfig.url}/#website`;

export type JsonLdNode = Record<string, unknown>;

/** `BreadcrumbList` from `[name, path]` pairs, root first. */
export function breadcrumbList(items: readonly (readonly [name: string, path: string])[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: `${siteConfig.url}${path}`,
    })),
  };
}

/**
 * Serialize for a `<script type="application/ld+json">` body. `<` is
 * escaped so text taken from content (a title, a description) can never
 * close the script element early.
 */
export function serializeJsonLd(data: JsonLdNode | JsonLdNode[]): string {
  const body = Array.isArray(data)
    ? { "@context": "https://schema.org", "@graph": data }
    : { "@context": "https://schema.org", ...data };
  return JSON.stringify(body).replace(/</g, "\\u003c");
}
