"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FiArrowRight } from "react-icons/fi";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

interface BoardRowProps {
  /** Zero-based position in the list — drives the entrance stagger. */
  index: number;
  /** 1-based rank; the top three get the primary accent. */
  rank: number;
  href: string;
  /** md+ grid template for the row's cells (must match the board's header). */
  gridClassName: string;
  children: React.ReactNode;
}

/**
 * BoardRow — shared row chrome for the leaderboard boards: entrance motion,
 * profile link, rank cell, hover highlight bar, and the trailing open arrow.
 * Each board supplies its own cells and the grid template they live in.
 */
const BoardRow = ({ index, rank, href, gridClassName, children }: BoardRowProps) => {
  const podium = rank <= 3;
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: EASE_OUT }}
      className="group relative"
    >
      <Link
        href={href}
        className={cn(
          "grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:gap-4",
          gridClassName,
        )}
      >
        {/* Hover highlight bar */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-primary transition-transform duration-base ease-out-soft group-hover:scale-y-100"
        />

        {/* Rank */}
        <span
          className={
            podium
              ? "font-mono text-lg font-semibold tabular-nums text-primary"
              : "font-mono text-lg tabular-nums text-muted"
          }
        >
          {String(rank).padStart(2, "0")}
        </span>

        {children}

        {/* Open */}
        <span
          aria-hidden
          className="hidden h-8 w-8 items-center justify-center justify-self-end rounded-full border border-border text-foreground transition-all duration-base ease-out-soft group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground md:flex"
        >
          <FiArrowRight
            size={14}
            className="transition-transform duration-base group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    </motion.li>
  );
};

export default BoardRow;
