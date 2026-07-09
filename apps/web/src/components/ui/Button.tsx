"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import {
  buttonBaseClasses,
  buttonSizeClasses,
  buttonVariantClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./buttonStyles";

export type { ButtonVariant, ButtonSize };

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

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
          buttonBaseClasses,
          "disabled:cursor-not-allowed disabled:opacity-60",
          buttonVariantClasses[variant],
          buttonSizeClasses[size],
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