"use client";

import * as React from "react";
import { motion, useScroll, useSpring } from "framer-motion";

/**
 * ScrollProgress — a 2px-tall scroll-progress bar fixed to the top of the
 * viewport. Uses a spring-damped motion value so the bar tracks the
 * scroll position with a slight, appealing lag rather than instant-locking
 * to the cursor.
 */
const ScrollProgress = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 130,
    damping: 22,
    restDelta: 0.001,
  });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-primary"
    />
  );
};

export default ScrollProgress;
