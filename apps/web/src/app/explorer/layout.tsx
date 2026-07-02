import type { Metadata } from "next";

// The explorer index is a Client Component; its metadata lives here. Per-CID
// detail pages (`[cid]/page.tsx`) override this via `generateMetadata`.
export const metadata: Metadata = {
  title: "Explorer",
  description:
    "Browse and search files anchored onchain across Autonomys, Ethereum, Base, Optimism, Arbitrum, Polygon, Solana, and Aptos. Look up any CID and its anchor records.",
  alternates: { canonical: "/explorer" },
  openGraph: {
    title: "Explorer · FileOnChain",
    description:
      "Search the multichain CID index — every anchored file across 10 chains.",
    url: "/explorer",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Explorer · FileOnChain",
    description:
      "Search the multichain CID index — every anchored file across 10 chains.",
  },
};

export default function ExplorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
