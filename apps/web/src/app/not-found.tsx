import Link from "next/link";
import { FiAlertTriangle, FiArrowLeft, FiCompass } from "react-icons/fi";
import { CHAINS } from "@fileonchain/sdk";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = {
  // Bare title — the root layout's title template appends "· FileOnChain".
  title: "404 — Not Found",
};

/**
 * Custom 404 — renders when no route matches. Provides quick links back to
 * the home page, the explorer, and the dashboard.
 */
export default function NotFound() {
  return (
    <PageShell size="narrow" padding="lg">
      <Card className="text-center">
        <div className="flex flex-col items-center gap-4 py-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
            <FiAlertTriangle size={26} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">404</p>
            <h1 className="mt-1 text-2xl md:text-3xl font-bold text-foreground">
              This route hasn&apos;t been anchored
            </h1>
            <p className="mt-2 text-sm text-muted max-w-md mx-auto">
              The page you&apos;re looking for either moved or never existed on this chain. Try the
              explorer, head back to upload, or check the dashboard.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Link href="/">
              <Button leftIcon={<FiArrowLeft size={14} />}>Back to upload</Button>
            </Link>
            <Link href="/explorer">
              <Button variant="secondary" leftIcon={<FiCompass size={14} />}>
                Open explorer
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="ghost">Dashboard</Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="mt-8">
        <EmptyState
          icon={<FiCompass size={20} />}
          title="Looking for a specific CID?"
          description={`Search by content address across all ${CHAINS.length} supported chains.`}
        />
      </div>
    </PageShell>
  );
}