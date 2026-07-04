"use client";

import * as React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useVisibleChains } from "@/hooks/useVisibleChains";

interface ChainTickerProps {
  className?: string;
}

/**
 * ChainTicker — editorial ticker strip showing every supported chain in a
 * continuous horizontal marquee. Doubles up the list and uses a CSS
 * marquee for a seamless loop. Pauses on hover via `group-hover`.
 *
 * Lives just below the hero so the chain support story is always visible.
 * The strips fade at both edges so the loop is not visually abrupt.
 */
const ChainTicker = ({ className }: ChainTickerProps) => {
  const visibleChains = useVisibleChains();
  // Tile the chain list twice to produce a seamless marquee loop.
  const tiles = [...visibleChains, ...visibleChains];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Supported chains"
      className={
        "group relative w-full overflow-hidden border-y border-border bg-surface/40 " +
        (className ?? "")
      }
    >
      {/* Edge masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-background to-transparent" />

      <div className="flex w-max animate-marquee-slow items-center gap-3 py-3 will-change-transform group-hover:[animation-play-state:paused]">
        {tiles.map((chain, i) => {
          const iconSrc = `/chains/${chain.shortName.toLowerCase()}.svg`;
          return (
            <div
              key={`${chain.id}-${i}`}
              className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface-elevated px-3 py-1.5"
            >
              <span className="relative flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                <Image
                  src={iconSrc}
                  alt={chain.name}
                  width={20}
                  height={20}
                  className="h-full w-full object-cover"
                />
              </span>
              <span className="text-xs font-medium text-foreground">{chain.shortName}</span>
              <span className="text-xs text-muted">· {chain.nativeCurrency.symbol}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default ChainTicker;
