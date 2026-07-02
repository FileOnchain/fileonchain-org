import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { lookupFile } from "@/lib/mock/cid-indexer";
import { truncateCID } from "@/lib/cid/format";
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
  if (!result) {
    return (
      <PageShell size="wide" padding="lg">
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-base font-semibold text-foreground">
            No public record for this CID
          </p>
          <p className="mt-2 text-sm text-muted">
            The CID may be valid on a chain but hasn&apos;t been indexed yet, or it
            was never anchored on FileOnChain. Try one of the seeded examples
            on the explorer index.
          </p>
          <Link
            href="/explorer"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Back to explorer
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <ExplorerDetailClient file={result.file} hits={result.hits} />
  );
}
