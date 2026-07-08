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
 * anchor's on-chain state. Settled states are green (verified — the
 * challenge window closed and fees were distributed — and plain anchored
 * on memo chains), in-flight states are amber (proposed inside its
 * challenge window, or a plain pending anchor), and bad states are red
 * (challenged by a counter-bond, rejected by a jury or CID race, or
 * missing entirely). The shape is identical across surfaces so users
 * learn the codes.
 */
const STATUS_VARIANTS: Record<StatusPillProps["status"], "success" | "warning" | "danger"> = {
  anchored: "success",
  verified: "success",
  pending: "warning",
  proposed: "warning",
  challenged: "danger",
  rejected: "danger",
  missing: "danger",
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
