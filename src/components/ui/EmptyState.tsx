import * as React from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * EmptyState — neutral placeholder for lists / search results that have no
 * data. Renders an icon, a heading, a sub-line, and an optional CTA.
 */
export const EmptyState = ({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center text-center gap-3",
      "rounded-xl border border-dashed border-border bg-surface/40 px-6 py-12",
      className,
    )}
  >
    {icon && (
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
    )}
    <h3 className="text-base font-semibold text-foreground">{title}</h3>
    {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export default EmptyState;