import * as React from "react";
import { cn } from "@/lib/cn";

interface PageShellProps {
  children: React.ReactNode;
  className?: string;
  size?: "narrow" | "default" | "wide";
  padding?: "none" | "sm" | "md" | "lg";
}

const sizeClasses = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
} as const;

const paddingClasses = {
  none: "",
  sm: "px-4 py-6",
  md: "px-4 py-10 md:px-6 md:py-14",
  lg: "px-4 py-14 md:px-8 md:py-20",
} as const;

/**
 * PageShell — wraps each route with a consistent max-width and padding.
 * Use for everything except the home page hero, which composes its own grid.
 */
export const PageShell = ({
  children,
  className,
  size = "default",
  padding = "md",
}: PageShellProps) => (
  <main className={cn("mx-auto w-full", sizeClasses[size], paddingClasses[padding], className)}>
    {children}
  </main>
);

export default PageShell;