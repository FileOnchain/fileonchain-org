import type { Metadata } from "next";

// The leaderboard page is a Client Component (sortable table), so its
// metadata lives here in a sibling server layout.
export const metadata: Metadata = {
  title: "Leaderboard",
  description:
    "The most active uploaders on FileOnChain — ranked by onchain anchors, bytes stored, and donations across EVM, Substrate, Solana, and Aptos.",
  alternates: { canonical: "/leaderboard" },
  openGraph: {
    title: "Leaderboard · FileOnChain",
    description:
      "Top uploaders ranked across every runtime — anchors, bytes, and public cache donations.",
    url: "/leaderboard",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Leaderboard · FileOnChain",
    description:
      "Top uploaders ranked across every runtime — anchors, bytes, and public cache donations.",
  },
};

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
