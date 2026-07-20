import * as React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Card } from "@/components/ui/Card";
import { PlannedBadge } from "@/components/cloud/PlannedBadge";

/**
 * Shell wrapper for every `/cloud/*` page. Uses the project's `PageShell`
 * shape so the layout matches `/agent-evidence` and `/verify`, and adds
 * a thin "in development" notice when the feature flag is off so the
 * honest-status convention is enforced even on gated surfaces.
 *
 * The page content is unaffected — `children` renders normally either
 * way. The notice is the only signal that the surface is closed.
 */
export const CloudShell = ({
  children,
  enabled,
  surfaceLabel,
}: {
  children: React.ReactNode;
  /** Result of `isCloudEvidenceEnabled()` — passed from the server component
   *  parent so this stays a pure presentational component. */
  enabled: boolean;
  /** Short label, e.g. "Hosted verification" or "Search". Used in the
   *  notice so the user knows which surface the message refers to. */
  surfaceLabel: string;
}) => (
  <PageShell size="wide" padding="lg" atmosphere>
    {!enabled && (
      <Card className="mb-6 flex items-center justify-between gap-3 border-warning/30 bg-warning/5 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PlannedBadge />
            <p className="text-sm font-medium text-foreground">
              {surfaceLabel} is in development
            </p>
          </div>
          <p className="mt-1 max-w-[60ch] text-xs text-muted">
            This surface is wired behind{" "}
            <code className="font-mono text-[11px]">FILEONCHAIN_CLOUD_EVIDENCE_ENABLED</code>
            . The backend, schema, and pages ship in this build; the route
            and UI are not reachable for users until the flag is flipped on.
          </p>
        </div>
      </Card>
    )}
    {children}
  </PageShell>
);

export default CloudShell;
