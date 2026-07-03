import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { availableOAuthProviders } from "@/lib/auth/config";
import PageShell from "@/components/layout/PageShell";
import LoginOptions from "@/components/auth/LoginOptions";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to FileOnChain with Google, GitHub, or any connected wallet to manage credits, API keys, and uploads.",
  alternates: { canonical: "/login" },
  robots: { index: false },
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

/** Only allow same-site relative redirect targets. */
const safeNext = (next: string | undefined): string =>
  next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  const target = safeNext(next);

  const session = await auth();
  if (session?.user) redirect(target);

  return (
    <PageShell size="narrow" atmosphere>
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-muted">
          Access your dashboard — activity logs, credits, API keys, and
          bring-your-own-key providers.
        </p>
        <div className="mt-8">
          <LoginOptions oauthProviders={availableOAuthProviders} next={target} />
        </div>
      </div>
    </PageShell>
  );
}
