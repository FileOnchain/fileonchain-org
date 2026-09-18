import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// The leaderboard page is a Client Component (sortable table), so its
// metadata lives here in a sibling server layout.
export const metadata: Metadata = pageMetadata({
  title: "Leaderboard",
  description:
    "FileOnChain's uploader leaderboard: identities ranked by anchors written, bytes kept alive onchain, and donations funding the public cache.",
  path: "/leaderboard",
  socialDescription: "Top uploaders by anchors, bytes kept alive, and public-cache donations.",
});

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
