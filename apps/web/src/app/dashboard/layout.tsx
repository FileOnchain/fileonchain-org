import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import DashboardNav from "@/components/dashboard/DashboardNav";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Your FileOnChain account — uploads, activity logs, credits, API keys, and BYOK providers.",
  // Per-user view — keep it out of the index.
  robots: { index: false, follow: false },
  alternates: { canonical: "/dashboard" },
};

/**
 * Auth guard for every /dashboard route. Guarding here (a Node server
 * layout) instead of Edge middleware keeps @neondatabase/serverless and the
 * auth config on the Node runtime.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/dashboard");

  return (
    <PageShell size="wide" padding="lg" atmosphere>
      <PageHeader
        className="mb-8"
        index="05"
        kicker="Your ledger"
        title="Your account."
        lede="Uploads, activity, credits, API keys, and bring-your-own-key providers — everything tied to your signed-in identity."
        actions={
          <Link
            href="/profile"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-surface-elevated px-4 text-sm font-medium text-foreground transition-all duration-base ease-out-soft hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Public profile →
          </Link>
        }
      />
      <DashboardNav />
      <div className="mt-8">{children}</div>
    </PageShell>
  );
}
