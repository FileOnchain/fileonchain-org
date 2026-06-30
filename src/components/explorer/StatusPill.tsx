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
 * anchor's on-chain state: anchored (green), pending (amber), or missing
 * (red). The shape is identical across surfaces so users learn the codes.
 */
const StatusPill = ({ status, size = "sm" }: StatusPillProps) => {
  const variant = {
    anchored: "success",
    pending: "warning",
    missing: "danger",
  }[status] as "success" | "warning" | "danger";
  return (
    <Badge variant={variant} size={size}>
      <span
        aria-hidden
        className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
          status === "anchored"
            ? "bg-success"
            : status === "pending"
              ? "bg-warning"
              : "bg-danger"
        } ${status === "anchored" ? "animate-orbit-pulse" : ""}`}
      />
      {status}
    </Badge>
  );
};

export default StatusPill;
