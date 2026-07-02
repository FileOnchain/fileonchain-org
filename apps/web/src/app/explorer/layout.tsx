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
};

export default function ExplorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
