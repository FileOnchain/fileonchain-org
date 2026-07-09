import type { Metadata } from "next";

// The leaderboard page is a Client Component (sortable table), so its
// metadata lives here in a sibling server layout.
export const metadata: Metadata = {
  title: "Leaderboard",
  description:
    "Every role in FileOnChain's verification market, ranked — top uploaders by anchors and bytes, top validators by stake and rewards, top platforms by anchors originated, and top FOCAT holders by holdings and voting power.",
  alternates: { canonical: "/leaderboard" },
  openGraph: {
    title: "Leaderboard · FileOnChain",
    description:
      "Top uploaders, validators, platforms, and FOCAT holders — the verification market, ranked.",
    url: "/leaderboard",
    type: "website",
  },
  // Without this, the root layout's twitter block (homepage copy) is
  // inherited wholesale — metadata merges shallowly per top-level key.
  twitter: {
    card: "summary_large_image",
    title: "Leaderboard · FileOnChain",
    description:
      "Top uploaders, validators, platforms, and FOCAT holders — the verification market, ranked.",
  },
};

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
