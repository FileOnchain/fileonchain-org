import { Badge } from "@/components/ui/Badge";

/**
 * Single-source `Planned` badge used across the `/cloud/*` surfaces. The
 * voice matches the rest of the project: literal "Planned" label,
 * warning-toned badge, and the canonical copy "Wired behind a feature
 * flag — not yet shipped" so users can distinguish a "we have not built
 * this" feature from a "we are still rolling it out" one.
 */
export const PlannedBadge = ({ size = "sm" }: { size?: "sm" | "md" }) => (
  <Badge variant="warning" size={size}>
    Planned
  </Badge>
);

export default PlannedBadge;
