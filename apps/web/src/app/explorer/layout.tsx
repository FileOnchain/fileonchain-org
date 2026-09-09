import type { Metadata } from "next";
import { ACTIVE_CHAINS } from "@fileonchain/sdk";

// Only networks open for anchoring, so the description never names a
// network beyond its integration status.
const LIVE_NETWORKS = Array.from(new Set(ACTIVE_CHAINS.map((c) => c.name))).join(", ");
const SOCIAL_DESCRIPTION = `Search the multichain CID index: every anchored file across ${ACTIVE_CHAINS.length} live networks.`;

// The explorer index is a Client Component; its metadata lives here. Per-CID
// detail pages (`[cid]/page.tsx`) override this via `generateMetadata`.
export const metadata: Metadata = {
  title: "Explorer",
  description: `Browse and search files anchored onchain across ${LIVE_NETWORKS}. Look up any CID and its anchor records.`,
  alternates: { canonical: "/explorer" },
  openGraph: {
    title: "Explorer · FileOnChain",
    description: SOCIAL_DESCRIPTION,
    url: "/explorer",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Explorer · FileOnChain",
    description: SOCIAL_DESCRIPTION,
  },
};

export default function ExplorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
