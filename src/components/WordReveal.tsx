"use client";

import * as React from "react";
import { motion } from "framer-motion";

interface WordRevealProps {
  text: string;
  /** Total stagger budget in seconds. Words split this evenly. */
  stagger?: number;
  /** Per-word animation duration in seconds. */
  duration?: number;
  /** Initial Y offset in px. */
  yOffset?: number;
  className?: string;
  /** Element to render the container as. Defaults to h1. */
  as?: "h1" | "h2" | "h3" | "p" | "div";
}

/**
 * WordReveal — splits a string into words and animates them in with a
 * coordinated stagger. Each word slides up + de-blurs into place. Falls
 * back gracefully to plain text if anything goes wrong.
 */
export const WordReveal = ({
  text,
  stagger = 0.045,
  duration = 0.55,
  yOffset = 18,
  className,
  as = "h1",
}: WordRevealProps) => {
  const words = text.split(/\s+/).filter(Boolean);
  const Comp = motion[as] as typeof motion.h1;
  return (
    <Comp
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: stagger, delayChildren: 0.05 } },
      }}
      className={className}
    >
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          variants={{
            hidden: { opacity: 0, y: yOffset, filter: "blur(8px)" },
            show: {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: { duration, ease: [0.16, 1, 0.3, 1] as const },
            },
          }}
          className="inline-block whitespace-pre"
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </Comp>
  );
};

export default WordReveal;
