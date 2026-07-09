import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  buttonBaseClasses,
  buttonSizeClasses,
  buttonVariantClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./buttonStyles";

interface ButtonLinkProps extends React.ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * ButtonLink — a next/link rendered on Button's design tokens. Use for
 * navigation that should read as an action (page-header CTAs and the like)
 * instead of restyling anchors by hand. Server-safe: no client hooks.
 */
export const ButtonLink = ({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonLinkProps) => (
  <Link
    className={cn(
      buttonBaseClasses,
      buttonVariantClasses[variant],
      buttonSizeClasses[size],
      className,
    )}
    {...rest}
  >
    {children}
  </Link>
);

export default ButtonLink;
