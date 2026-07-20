import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

/**
 * Server metadata for every `/cloud/*` page. Title template produces
 * "Cloud · FileOnChain" for the marketing landing, and the canonical +
 * OG/Twitter overrides stop the root layout's homepage copy from
 * bleeding into shared-link previews (the warning comment at
 * `verify/layout.tsx:17-24` explains why).
 */
export const metadata: Metadata = {
  title: "Cloud",
  description:
    "FileOnChain Cloud — hosted anchoring, evidence ingestion, agent-run sealing, hosted verification, retention, and search. Built on the open FileOnChain Evidence Protocol.",
  alternates: { canonical: `${siteConfig.url}/cloud` },
  openGraph: {
    title: "Cloud · FileOnChain",
    description:
      "Hosted anchoring, evidence ingestion, agent-run sealing, hosted verification, retention, and search — built on the open FileOnChain Evidence Protocol.",
    url: "/cloud",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cloud · FileOnChain",
    description:
      "Hosted anchoring, evidence ingestion, agent-run sealing, hosted verification, retention, and search — built on the open FileOnChain Evidence Protocol.",
  },
};

export default function CloudLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
