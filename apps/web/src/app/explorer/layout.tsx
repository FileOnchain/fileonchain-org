import type { Metadata } from "next";
import { ACTIVE_CHAINS } from "@fileonchain/sdk";
import { pageMetadata } from "@/lib/seo";

// Only networks open for anchoring, so the description never names a
// network beyond its integration status.
const LIVE_NETWORKS = Array.from(new Set(ACTIVE_CHAINS.map((c) => c.name))).join(", ");

// The explorer index is a Client Component; its metadata lives here. Per-CID
// detail pages (`[cid]/page.tsx`) override this via `generateMetadata`.
export const metadata: Metadata = pageMetadata({
  title: "Explorer",
  description: `Browse and search files anchored onchain across ${LIVE_NETWORKS}. Look up any CID and its anchor records.`,
  path: "/explorer",
  socialDescription: `Search the multichain CID index: every anchored file across ${ACTIVE_CHAINS.length} live networks.`,
});

export default function ExplorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
