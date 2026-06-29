import * as React from "react";
import { cn } from "@/lib/cn";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "full";
}

const roundedClasses = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
} as const;

/**
 * Skeleton — placeholder for content that is loading. Uses a slow opacity
 * pulse to indicate indeterminate progress without a spinner.
 */
export const Skeleton = ({
  width,
  height,
  rounded = "md",
  className,
  style,
  ...rest
}: SkeletonProps) => {
  return (
    <div
      aria-hidden
      className={cn(
        "bg-surface animate-pulse-soft",
        roundedClasses[rounded],
        className,
      )}
      style={{ width, height, ...style }}
      {...rest}
    />
  );
};

export default Skeleton;