import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// The cache page itself is a Client Component, so its metadata lives here in a
// sibling server layout.
export const metadata: Metadata = pageMetadata({
  title: "Private Cache",
  description:
    "Pay once for an encrypted private cache of your onchain files. Fast retrieval, AES-GCM encryption, tiered pricing across every supported chain.",
  path: "/cache",
  socialDescription: "Encrypted, pay-once private caching for files you anchor onchain.",
});

export default function CacheLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
