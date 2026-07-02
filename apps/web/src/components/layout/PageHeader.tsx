import * as React from "react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  /** Ledger index for the page, e.g. "02" — mirrors the hero's "VOL. 01" motif. */
  index: string;
  /** Short uppercase kicker, e.g. "Cross-chain indexer". */
  kicker: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  /** Right-aligned slot for the page's primary action(s). */
  actions?: React.ReactNode;
  className?: string;
}

/** Staggered CSS-only entrance — server-safe, no framer-motion needed. */
const reveal = (delayMs: number): React.CSSProperties => ({
  animationDelay: `${delayMs}ms`,
  animationFillMode: "backwards",
});

/**
 * PageHeader — editorial header for interior routes (explorer, cache,
 * donations, dashboard). Keeps them in the same "ledger" design language as
 * the home hero: mono index + tracked kicker over a hairline rule, a large
 * tight sans headline, and an optional lede + action slot.
 */
export const PageHeader = ({
  index,
  kicker,
  title,
  lede,
  actions,
  className,
}: PageHeaderProps) => (
  <header className={cn("w-full", className)}>
    {/* Ledger rule — index · kicker · hairline running to the edge. */}
    <div
      className="flex items-center gap-3 animate-fade-up motion-reduce:animate-none"
      style={reveal(0)}
    >
      <span className="font-mono text-[10px] font-semibold tracking-[0.22em] text-primary">
        N°{index}
      </span>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
        {kicker}
      </p>
      <span aria-hidden className="hairline min-w-8 flex-1 opacity-60" />
    </div>

    <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl space-y-3">
        <h1
          className="text-balance text-4xl font-bold leading-[1.02] tracking-tight text-foreground md:text-5xl animate-fade-up motion-reduce:animate-none"
          style={reveal(60)}
        >
          {title}
        </h1>
        {lede && (
          <p
            className="text-pretty text-sm leading-relaxed text-muted md:text-base animate-fade-up motion-reduce:animate-none"
            style={reveal(120)}
          >
            {lede}
          </p>
        )}
      </div>
      {actions && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 animate-fade-up motion-reduce:animate-none"
          style={reveal(160)}
        >
          {actions}
        </div>
      )}
    </div>
  </header>
);

export default PageHeader;
