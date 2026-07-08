import * as React from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { CHAIN_STATUS_LABELS, type ChainStatus } from "@fileonchain/sdk";

const STATUS_VARIANTS: Record<ChainStatus, BadgeVariant> = {
  active: "success",
  planned: "info",
  deprecated: "danger",
};

/**
 * ChainStatusBadge — rollout-status pill for a chain (Active / Planned /
 * Deprecated). By default the "Active" state renders nothing so healthy
 * chains stay unbadged; pass `showActive` on surfaces that enumerate the
 * status explicitly.
 */
export const ChainStatusBadge = ({
  status,
  showActive = false,
}: {
  status: ChainStatus;
  showActive?: boolean;
}) => {
  if (status === "active" && !showActive) return null;
  return (
    <Badge variant={STATUS_VARIANTS[status]} size="sm">
      {CHAIN_STATUS_LABELS[status]}
    </Badge>
  );
};

export default ChainStatusBadge;
