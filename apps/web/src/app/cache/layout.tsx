import type { Metadata } from "next";

// The cache page itself is a Client Component, so its metadata lives here in a
// sibling server layout.
export const metadata: Metadata = {
  title: "Private Cache",
  description:
    "Pay once for an encrypted private cache of your onchain files. Fast retrieval, AES-GCM encryption, tiered pricing across every supported chain.",
  alternates: { canonical: "/cache" },
  openGraph: {
    title: "Private Cache · FileOnChain",
    description:
      "Encrypted, pay-once private caching for files you anchor onchain.",
    url: "/cache",
    type: "website",
  },
};

export default function CacheLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
