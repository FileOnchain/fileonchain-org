import type { Metadata } from "next";

/**
 * Server metadata for the `/cloud/*` workspace pages (projects, search,
 * webhooks, exports, ...). They are per-account views behind sign-in, so
 * they stay out of the index and carry no canonical: with one here they
 * all declared `/cloud` as their canonical URL. The public `/cloud`
 * landing overrides this block from `page.tsx` with its own indexable
 * metadata and share card.
 */
export const metadata: Metadata = {
  title: "Cloud",
  description:
    "Your FileOnChain Cloud workspace: projects, hosted verification, search, retention, webhooks, and exports.",
  robots: { index: false, follow: false },
};

export default function CloudLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
