import * as React from "react";
import { cn } from "@/lib/cn";

interface InlineLoaderProps {
  /** What is being fetched — shown as the explorer's mono micro-label. */
  label: string;
  className?: string;
}

/**
 * InlineLoader — compact indeterminate loader for expanded detail panels.
 * A spinner ring (same idiom as Button's loading state) plus a mono
 * micro-label naming the work in progress, so the wait reads as "reading
 * the chain" instead of an anonymous empty box.
 */
export const InlineLoader = ({ label, className }: InlineLoaderProps) => (
  <div
    role="status"
    className={cn(
      "flex items-center justify-center gap-2.5 rounded-lg border border-border bg-surface px-4 py-6",
      className,
    )}
  >
    <span
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
    />
    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
      {label}
    </span>
  </div>
);

export default InlineLoader;
