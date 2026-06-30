"use client";

import * as React from "react";
import { motion, type HTMLMotionProps, type Variants } from "framer-motion";
import { cn } from "@/lib/cn";

/* --------------------------------------------------------------------------
 * ScrollReveal — small wrapper that fades + lifts children into view as the
 * user scrolls them into the viewport. Uses `whileInView` from framer-motion
 * with `once: true` so the reveal feels one-shot (no re-animation on scroll
 * back). Respects prefers-reduced-motion through framer's `MotionConfig`
 * configured at the layout level.
 *
 * Variants are matched to the hero's stagger language so the two reads feel
 * coordinated.
 * ------------------------------------------------------------------------ */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

/**
 * `itemVariants` uses `opacity: 1` as the SSR-rendered visible state so
 * that sections stay readable even if framer-motion fails to hydrate
 * (e.g. when a chunk 404s in dev). When JS DOES run, the variant chain
 * `hidden` -> `show` runs and the entrance animation plays once.
 */
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: EASE_OUT },
  },
};

interface ScrollRevealProps extends Omit<HTMLMotionProps<"div">, "children"> {
  /** Render as a section (block). Defaults to div. */
  as?: "section" | "div" | "article" | "header" | "footer";
  /** Items inside will stagger in. Set false for single-shot reveals. */
  stagger?: boolean;
  /** Amount of element visible before triggering (0..1). */
  amount?: number;
  /** Render once and stay (default true). */
  once?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const ScrollReveal = ({
  as = "div",
  stagger = false,
  amount = 0.25,
  once = true,
  className,
  children,
  ...rest
}: ScrollRevealProps) => {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      initial={false}
      whileInView="show"
      viewport={{ once, amount }}
      variants={stagger ? containerVariants : undefined}
      className={cn(className)}
      {...rest}
    >
      {stagger ? <RevealItems>{children}</RevealItems> : children}
    </Comp>
  );
};

interface RevealItemProps extends HTMLMotionProps<"div"> {
  className?: string;
}

const RevealItem = ({ className, children, ...rest }: RevealItemProps) => (
  <motion.div variants={itemVariants} className={cn(className)} {...rest}>
    {children}
  </motion.div>
);

/** Internal helper that recursively wraps top-level children in RevealItem. */
const RevealItems = ({ children }: { children: React.ReactNode }) => {
  const items = React.Children.toArray(children);
  return (
    <>
      {items.map((child, i) => (
        <RevealItem key={(child as React.ReactElement)?.key ?? i}>{child}</RevealItem>
      ))}
    </>
  );
};

export default ScrollReveal;
