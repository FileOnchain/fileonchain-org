import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/**
 * Single-source feature card for the `/cloud` marketing landing and any
 * later cross-section grid. Mirrors the inline pattern at
 * `apps/web/src/app/agent-evidence/page.tsx:208-219` — title, body, and
 * a status badge — so the visual rhythm stays consistent across the
 * product.
 *
 * `status` follows the project's `Planned` / `Available` voice: literal
 * label, `warning` variant for Planned, `success` for Available. A
 * future "Beta" tier would map cleanly onto a new variant.
 */
export type CloudFeatureStatus = "Available" | "Planned";

export interface CloudFeature {
  title: string;
  body: string;
  status: CloudFeatureStatus;
}

const badgeVariant = (status: CloudFeatureStatus) =>
  status === "Available" ? "success" : "warning";

export const FeatureCard = ({ feature }: { feature: CloudFeature }) => (
  <Card className="p-5">
    <div className="flex items-start justify-between gap-3">
      <h3 className="font-medium">{feature.title}</h3>
      <Badge variant={badgeVariant(feature.status)} size="sm">
        {feature.status}
      </Badge>
    </div>
    <p className="mt-2 text-sm text-muted">{feature.body}</p>
  </Card>
);

export default FeatureCard;
