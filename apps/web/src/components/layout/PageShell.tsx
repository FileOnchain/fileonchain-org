import * as React from "react";
import { cn } from "@/lib/cn";

interface PageShellProps {
  children: React.ReactNode;
  className?: string;
  size?: "narrow" | "default" | "wide";
  padding?: "none" | "sm" | "md" | "lg";
  /**
   * Renders a faded grid + soft primary tint behind the top of the page so
   * interior routes share the home page's paper-and-ink atmosphere instead of
   * sitting on a flat background.
   */
  atmosphere?: boolean;
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
  atmosphere = false,
}: PageShellProps) => (
  <main
    className={cn(
      "relative mx-auto w-full",
      sizeClasses[size],
      paddingClasses[padding],
      className,
    )}
  >
    {atmosphere && (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[440px] overflow-hidden"
      >
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-70" />
        <div
          className="absolute -top-40 left-1/2 h-[380px] w-[760px] -translate-x-1/2 rounded-full opacity-[0.08] blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, var(--primary) 0%, var(--accent) 55%, transparent 100%)",
          }}
        />
      </div>
    )}
    {children}
  </main>
);

export default PageShell;
