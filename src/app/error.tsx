"use client";

import * as React from "react";
import Link from "next/link";
import { FiAlertOctagon, FiArrowLeft, FiRefreshCw } from "react-icons/fi";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary — surfaces any uncaught runtime error in the route
 * tree. Logs to the console so the digest + stack show up in the dev
 * terminal, and gives the user a one-click reset.
 */
export default function GlobalError({ error, reset }: ErrorProps) {
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[FileOnChain] Route error:", error);
  }, [error]);

  return (
    <PageShell size="narrow" padding="lg">
      <Card className="text-center">
        <div className="flex flex-col items-center gap-4 py-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
            <FiAlertOctagon size={26} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-danger">Error</p>
            <h1 className="mt-1 text-2xl md:text-3xl font-bold text-foreground">
              Something broke on this chain
            </h1>
            <p className="mt-2 text-sm text-muted max-w-md mx-auto">
              An unexpected error occurred while rendering this page. Try again, or head back home.
            </p>
          </div>

          {error.digest && (
            <code className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-mono text-muted">
              {error.digest}
            </code>
          )}

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button onClick={reset} leftIcon={<FiRefreshCw size={14} />}>
              Try again
            </Button>
            <Link href="/">
              <Button variant="ghost" leftIcon={<FiArrowLeft size={14} />}>
                Back to upload
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}