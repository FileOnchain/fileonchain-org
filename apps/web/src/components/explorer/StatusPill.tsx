"use client";

import * as React from "react";
import type { AnchorStatus } from "@/lib/mock/cid-indexer";
import { Badge } from "@/components/ui/Badge";

interface StatusPillProps {
  status: AnchorStatus;
  size?: "sm" | "md";
}

/**
 * StatusPill — colored badge used by the explorer to communicate an
 * anchor's on-chain state. Landed anchors are green, in-flight sends are
 * amber, and failed sends are red. The shape is identical across surfaces
 * so users learn the codes.
 */
const STATUS_VARIANTS: Record<StatusPillProps["status"], "success" | "warning" | "danger"> = {
  anchored: "success",
  pending: "warning",
  failed: "danger",
};

const StatusPill = ({ status, size = "sm" }: StatusPillProps) => {
  const variant = STATUS_VARIANTS[status];
  const settled = variant === "success";
  return (
    <Badge variant={variant} size={size}>
      <span
        aria-hidden
        className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
          variant === "success"
            ? "bg-success"
            : variant === "warning"
              ? "bg-warning"
              : "bg-danger"
        } ${settled ? "animate-orbit-pulse" : ""}`}
      />
      {status}
    </Badge>
  );
};

export default StatusPill;
