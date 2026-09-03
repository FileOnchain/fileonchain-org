"use client";

import * as React from "react";
import { motion } from "motion/react";
import { formatBytes } from "@/lib/cid/format";

/**
 * Named formatters, so Server Components can pick a format without
 * passing a function across the server→client boundary (functions are
 * not serializable — passing one crashes the whole route render).
 * Client callers may still pass a function directly.
 */
export type StatFormat = "integer" | "compact" | "locale" | "bytes";

const NAMED_FORMATS: Record<StatFormat, (n: number) => string> = {
  integer: (n) => Math.round(n).toString(),
  compact: (n) => compactNumber(n),
  locale: (n) => Math.round(n).toLocaleString(),
  bytes: (n) => formatBytes(n),
};

interface StatProps {
  value: number;
  /** Compact formatter — a named variant (server-safe) or a function. */
  format?: StatFormat | ((n: number) => string);
  suffix?: string;
  prefix?: string;
  label: string;
  hint?: string;
  startCounting?: boolean;
}

/**
 * StatCounter — animates a number from 0 → target when in view. Uses
 * rAF with an ease-out-cubic curve so the number feels like it's ticking
 * up. Caller controls formatting via `format` so big numbers can be
 * rendered in compact form (e.g. "4.8M") without colliding with
 * neighbors.
 */
export const StatCounter = ({
  value,
  format,
  suffix,
  prefix,
  label,
  hint,
  startCounting = true,
}: StatProps) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = startCounting && (typeof window === "undefined" ? false : true);
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (t: number) => {
      // Clamp below too — a rAF timestamp can land before `start` was sampled,
      // which would drive the eased value negative.
      const k = Math.min(1, Math.max(0, (t - start) / dur));
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(value * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, inView]);

  const formatFn =
    typeof format === "function"
      ? format
      : NAMED_FORMATS[format ?? "locale"];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }}
      className="flex min-w-0 flex-col items-start gap-1"
    >
      <span className="flex items-baseline gap-0.5 font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground md:text-4xl">
        {prefix && <span className="text-muted">{prefix}</span>}
        <span className="truncate">{formatFn(display)}</span>
        {suffix && <span className="ml-0.5 shrink-0 text-primary">{suffix}</span>}
      </span>
      <span className="truncate text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      {hint && <span className="truncate text-[10px] text-muted/70">{hint}</span>}
      <motion.span
        aria-hidden
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
        className="mt-2 h-px w-10 origin-left bg-primary/40"
      />
    </motion.div>
  );
};

/** Compact large-number format used by the hero stat row. */
export const compactNumber = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
};

/**
 * LiveLedgerTicker — scrolling feed of recent on-chain anchor events.
 * CSS marquee, pause-on-hover.
 *
 * `events` is always the indexer's real recent rows (the explorer page
 * fetches them server-side, the homepage hero via `/api/indexer/recent`),
 * so every item is a genuine anchor linking to its CID page. An empty
 * feed renders nothing — this component must never dress fabricated
 * CIDs up as data.
 */

export interface LedgerTickerEvent {
  /** Full CID — items link to /explorer/<cid>; display is truncated. */
  cid: string;
  chain: string;
  time: string;
}

const truncateTickerCid = (cid: string): string =>
  cid.length <= 12 ? cid : `${cid.slice(0, 6)}…${cid.slice(-4)}`;

interface LiveLedgerTickerProps {
  /** Real indexed anchor events, newest first. Empty renders nothing. */
  events: LedgerTickerEvent[];
}

const LiveLedgerTicker = ({ events }: LiveLedgerTickerProps) => {
  if (events.length === 0) return null;
  const loop = [...events, ...events];
  return (
    <div className="group relative w-full overflow-hidden rounded-md border border-border bg-surface/60">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-linear-to-r from-surface to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-linear-to-l from-surface to-transparent" />
      <div className="flex w-max animate-marquee items-center gap-6 py-2 will-change-transform group-hover:[animation-play-state:paused]">
        {loop.map((e, i) => (
          <a
            key={`${e.cid}-${i}`}
            href={`/explorer/${e.cid}`}
            className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted transition-colors hover:text-foreground"
          >
            <span className="flex h-1.5 w-1.5 animate-orbit-pulse rounded-full bg-success" />
            <span className="text-foreground">{truncateTickerCid(e.cid)}</span>
            <span>·</span>
            <span>{e.chain}</span>
            <span className="text-muted">·</span>
            <span className="text-muted/70">{e.time}</span>
          </a>
        ))}
      </div>
    </div>
  );
};

export default LiveLedgerTicker;
