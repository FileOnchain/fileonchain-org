import type { Metadata } from "next";

// The leaderboard page is a Client Component (sortable table), so its
// metadata lives here in a sibling server layout.
export const metadata: Metadata = {
  title: "Leaderboard",
  description:
    "FileOnChain's uploader leaderboard — identities ranked by anchors written, bytes kept alive on-chain, and donations funding the public cache.",
  alternates: { canonical: "/leaderboard" },
  openGraph: {
    title: "Leaderboard · FileOnChain",
    description:
      "Top uploaders by anchors, bytes kept alive, and public-cache donations.",
    url: "/leaderboard",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Leaderboard · FileOnChain",
    description:
      "Top uploaders by anchors, bytes kept alive, and public-cache donations.",
  },
};

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
