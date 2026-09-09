import HomeContent from "@/components/HomeContent";
import { getDeveloperQuickstartTabs } from "@/lib/snippets/quickstart";

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
