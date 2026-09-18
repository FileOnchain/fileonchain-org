import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";
import { getDeveloperQuickstartTabs } from "@/lib/snippets/quickstart";

// Title, description, share card, and JSON-LD come from the root layout;
// only the canonical lives here so it never leaks into other routes.
export const metadata: Metadata = {
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": "/changelog/feed.xml" },
  },
};

/**
 * `/`, the homepage. A thin server shell: it highlights the developer
 * quickstart snippets (Shiki runs on the server, and the SDK snippet is
 * read from a file `next build` type-checks) and hands them to the client
 * body in `components/HomeContent.tsx`. Metadata comes from the root layout.
 */
export default async function Home() {
  const quickstartTabs = await getDeveloperQuickstartTabs();
  return <HomeContent quickstartTabs={quickstartTabs} />;
}
