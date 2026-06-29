"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover active:translate-y-px disabled:bg-muted disabled:text-muted-foreground",
  secondary:
    "bg-surface text-foreground border border-border hover:bg-surface-elevated hover:border-primary/40",
  ghost: "bg-transparent text-foreground hover:bg-surface",
  outline:
    "bg-transparent text-primary border border-primary hover:bg-primary hover:text-primary-foreground",
  danger:
    "bg-danger text-white hover:opacity-90 active:translate-y-px disabled:opacity-50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-md gap-2",
  lg: "h-12 px-6 text-base rounded-lg gap-2.5",
};

/**
 * Button — primary interactive primitive.
 *
 * Variants map to the design tokens in globals.css. All buttons share the
 * same focus ring and transition timing for visual consistency.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center font-medium",
          "transition-colors duration-base ease-out-soft",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && "w-full",
          className,
        )}
        {...rest}
      >
        {isLoading ? (
          <span
            aria-hidden
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
          />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  },
);

Button.displayName = "Button";

export default Button;