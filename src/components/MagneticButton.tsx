"use client";

import * as React from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/cn";

interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Strength of the magnetic pull — value in px. */
  strength?: number;
  /** Render as a Next Link instead of a button. */
  href?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "outline";
  fullWidth?: boolean;
}

const VARIANTS = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover shadow-elev-1",
  secondary:
    "bg-surface-elevated text-foreground border border-border hover:border-primary/40",
  ghost: "bg-transparent text-foreground hover:bg-surface",
  outline:
    "bg-transparent text-primary border border-primary hover:bg-primary hover:text-primary-foreground",
} as const;

/**
 * MagneticButton — a button (or Next link) that subtly follows the cursor
 * like a magnet. Uses framer-motion springs so the motion is smooth and
 * releases cleanly when the cursor leaves. Adds tactile energy without
 * relying on gradients or italic flourishes.
 */
export const MagneticButton = React.forwardRef<HTMLButtonElement, MagneticButtonProps>(
  (
    {
      strength = 14,
      className,
      leftIcon,
      rightIcon,
      variant = "primary",
      href,
      children,
      type = "button",
      fullWidth,
      ...rest
    },
    ref,
  ) => {
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const springX = useSpring(x, { stiffness: 220, damping: 18, mass: 0.5 });
    const springY = useSpring(y, { stiffness: 220, damping: 18, mass: 0.5 });
    const shadow = useTransform(
      [springX, springY],
      ([vx, vy]) =>
        `${vx as number}px ${4 + (vy as number) * 0.1}px 24px rgba(11,13,18,0.18)`,
    );

    const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      x.set(Math.max(-strength, Math.min(strength, px * 0.35)));
      y.set(Math.max(-strength, Math.min(strength, py * 0.35)));
    };
    const handleMouseLeave = () => {
      x.set(0);
      y.set(0);
    };

    const inner = (
      <motion.span
        style={{ x: springX, y: springY, boxShadow: shadow as unknown as string }}
        className={cn(
          "relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-md px-5 text-sm font-semibold transition-colors duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          VARIANTS[variant],
          fullWidth && "w-full",
          className,
        )}
      >
        {leftIcon}
        <span>{children}</span>
        {rightIcon}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-white/15 transition-transform duration-700 ease-out-soft group-hover/Magnetic:translate-x-full"
        />
      </motion.span>
    );

    if (href) {
      return (
        <Link
          href={href}
          ref={ref as React.Ref<HTMLAnchorElement>}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="group/Magnetic inline-flex"
        >
          {inner}
        </Link>
      );
    }

    return (
      <button
        ref={ref}
        type={type}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        {...rest}
        className="group/Magnetic inline-flex"
      >
        {inner}
      </button>
    );
  },
);
MagneticButton.displayName = "MagneticButton";

export default MagneticButton;
