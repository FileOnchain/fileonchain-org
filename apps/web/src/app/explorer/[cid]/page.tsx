import type { Metadata } from "next";
import * as React from "react";
import { notFound } from "next/navigation";
import { lookupFile } from "@/lib/mock/cid-indexer";
import { truncateCID } from "@/lib/cid/format";
import { siteConfig } from "@/lib/site";
import ExplorerDetailClient from "./ExplorerDetailClient";

interface PageProps {
  params: Promise<{ cid: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { cid } = await params;
  const result = await lookupFile(cid);
  const canonical = `/explorer/${cid}`;

  if (!result) {
    return {
      title: `Unknown CID · ${truncateCID(cid)}`,
      description: `No public record for ${cid} on FileOnChain yet.`,
      alternates: { canonical },
      // Nothing to index for an unresolved CID.
      robots: { index: false, follow: true },
    };
  }

  const { name, description, category } = result.file;
  const title = `${name} · ${truncateCID(cid)}`;
  const desc =
    description ||
    `${name} — a ${category} file anchored onchain. View its CID records and chunk map on FileOnChain.`;

  return {
    title,
    description: desc,
    alternates: { canonical },
    openGraph: { title: `${title} · FileOnChain`, description: desc, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description: desc },
  };
}

/**
 * Server component — looks up the registered file (if any) and pre-fetches
 * the anchor hits + chunks. Hands off rendering to the client component so
 * the chunk table can hydrate smoothly on the browser.
 */
export default async function ExplorerCIDPage({ params }: PageProps) {
  const { cid } = await params;
  const result = await lookupFile(cid);
  // Real 404 (status + contextual not-found.tsx) instead of a soft-404 —
  // generateMetadata above already marks the unresolved CID as noindex.
  if (!result) notFound();

  // Breadcrumb structured data — lets Google render "Home › Explorer › file"
  // instead of the raw URL in search results.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
      {
        "@type": "ListItem",
        position: 2,
        name: "Explorer",
        item: `${siteConfig.url}/explorer`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: result.file.name,
        item: `${siteConfig.url}/explorer/${cid}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ExplorerDetailClient file={result.file} hits={result.hits} />
    </>
  );
}
