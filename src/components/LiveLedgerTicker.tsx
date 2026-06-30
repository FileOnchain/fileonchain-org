"use client";

import * as React from "react";
import { motion } from "framer-motion";

interface StatProps {
  value: number;
  /** Compact formatter — caller's responsibility to format display. */
  format?: (n: number) => string;
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
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(value * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, inView]);

  const defaultFormat = (n: number) => Math.round(n).toLocaleString();
  const formatFn = format ?? defaultFormat;

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
 * LiveLedgerTicker — small scrolling feed of mock "recent onchain anchor"
 * events that drifts under the hero kicker. Uses CSS marquee + a pause-
 * on-hover interaction. Purely decorative — drives the "alive" feel.
 */

interface LedgerEvent {
  cid: string;
  chain: string;
  time: string;
}

const LEDGER_FEED: LedgerEvent[] = [
  { cid: "bafy…z3q1", chain: "AUTONOMYS", time: "now" },
  { cid: "bafy…71fv", chain: "BASE", time: "2s" },
  { cid: "bafy…kk8d", chain: "SOLANA", time: "5s" },
  { cid: "bafy…lp2c", chain: "ARBITRUM", time: "9s" },
  { cid: "bafy…mn5w", chain: "POLYGON", time: "13s" },
  { cid: "bafy…rr7u", chain: "OPTIMISM", time: "18s" },
  { cid: "bafy…xs9b", chain: "APTOS", time: "24s" },
  { cid: "bafy…dj4h", chain: "ETHEREUM", time: "31s" },
];

const LiveLedgerTicker = () => {
  const loop = [...LEDGER_FEED, ...LEDGER_FEED];
  return (
    <div className="group relative w-full overflow-hidden rounded-md border border-border bg-surface/60">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-surface to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-surface to-transparent" />
      <div className="flex w-max animate-marquee items-center gap-6 py-2 will-change-transform group-hover:[animation-play-state:paused]">
        {loop.map((e, i) => (
          <div
            key={`${e.cid}-${i}`}
            className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted"
          >
            <span className="flex h-1.5 w-1.5 animate-orbit-pulse rounded-full bg-success" />
            <span className="text-foreground">{e.cid}</span>
            <span>·</span>
            <span>{e.chain}</span>
            <span className="text-muted">·</span>
            <span className="text-muted/70">{e.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveLedgerTicker;
