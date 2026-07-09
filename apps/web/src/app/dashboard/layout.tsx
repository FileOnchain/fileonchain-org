import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/ButtonLink";
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
          <ButtonLink href="/profile" variant="secondary">
            Public profile →
          </ButtonLink>
        }
      />
      <DashboardNav />
      <div className="mt-8">{children}</div>
    </PageShell>
  );
}
