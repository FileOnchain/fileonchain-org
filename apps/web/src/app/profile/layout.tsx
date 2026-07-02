import type { Metadata } from "next";

// Metadata for the client-side /profile entry point. The /profile/[address]
// pages fully override every field below (including robots) in their own
// generateMetadata, so the noindex here only applies to the per-user route.
export const metadata: Metadata = {
  title: "Your profile",
  description:
    "Your public FileOnChain profile — anchors, bytes, donations, and linked wallets across every runtime.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/profile" },
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
