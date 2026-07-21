import type { Metadata } from "next";
import * as React from "react";
import { notFound } from "next/navigation";
import {
  lookupFile,
  getChunksForFile,
  getFilesByUploader,
} from "@/lib/indexer/queries";
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
      description: `No public anchor record for ${cid} on FileOnChain yet.`,
      alternates: { canonical },
      // Nothing to index for an unresolved CID.
      robots: { index: false, follow: true },
    };
  }

  const title = `CID ${truncateCID(cid, 12, 10)} · FileOnChain`;
  const desc = `${result.hits.length} onchain anchor${result.hits.length === 1 ? "" : "s"} across ${new Set(result.hits.map((h) => h.chainId)).size} chain${result.hits.length === 1 ? "" : "s"} — view the tx receipts and submitter on FileOnChain.`;

  return {
    title,
    description: desc,
    alternates: { canonical },
    openGraph: { title, description: desc, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description: desc },
  };
}

/**
 * Server component — looks up the CID across the indexer DB and
 * pre-fetches the anchor hits. Hands off rendering to the client
 * component so the chunk table can hydrate smoothly on the browser.
 */
export default async function ExplorerCIDPage({ params }: PageProps) {
  const { cid } = await params;
  const result = await lookupFile(cid);
  // Real 404 (status + contextual not-found.tsx) instead of a soft-404 —
  // generateMetadata above already marks the unresolved CID as noindex.
  if (!result) notFound();

  // Pull the submitter off the first hit so the related-files query can
  // run in parallel with the chunks query — both depend on data we
  // already have server-side. The client component takes the resolved
  // arrays as props; no client-side DB shim needed.
  const submitter = result.hits[0]?.submitter;
  const [chunks, related] = await Promise.all([
    getChunksForFile(result.cid),
    submitter
      ? getFilesByUploader(submitter, result.cid, 4)
      : Promise.resolve([]),
  ]);

  // Breadcrumb structured data — lets Google render "Home › Explorer › CID"
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
        name: truncateCID(cid, 12, 10),
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
      <ExplorerDetailClient
        cid={result.cid}
        hits={result.hits}
        initialChunks={chunks}
        initialRelated={related}
      />
    </>
  );
}