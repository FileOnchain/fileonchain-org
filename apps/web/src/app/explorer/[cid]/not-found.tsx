import Link from "next/link";
import { FiCompass, FiSearch } from "react-icons/fi";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Contextual 404 for /explorer/[cid] — rendered when `lookupFile` finds no
 * public record, with a real 404 status instead of the previous soft-404.
 */
export default function ExplorerCidNotFound() {
  return (
    <PageShell size="narrow" padding="lg">
      <Card className="text-center">
        <div className="flex flex-col items-center gap-4 py-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
            <FiSearch size={26} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">404</p>
            <h1 className="mt-1 text-2xl md:text-3xl font-bold text-foreground">
              No public record for this CID
            </h1>
            <p className="mt-2 text-sm text-muted max-w-md mx-auto">
              The CID may be valid on a chain but hasn&apos;t been indexed yet, or it was never
              anchored on FileOnChain. Try one of the seeded examples on the explorer index.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Link href="/explorer">
              <Button leftIcon={<FiCompass size={14} />}>Back to explorer</Button>
            </Link>
            <Link href="/">
              <Button variant="ghost">Anchor a file</Button>
            </Link>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
