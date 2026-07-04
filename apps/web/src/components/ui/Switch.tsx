"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name; required because the control renders no text. */
  "aria-label"?: string;
  id?: string;
  className?: string;
}

/**
 * Switch — an accessible on/off toggle (`role="switch"`), styled to match
 * the Button/Input family. Controlled only.
 */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-base",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked
          ? "border-primary bg-primary"
          : "border-border bg-surface-elevated",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none block h-4 w-4 translate-x-1 rounded-full bg-background shadow-elev-1 transition-transform duration-base",
          checked && "translate-x-6",
        )}
      />
    </button>
  ),
);
Switch.displayName = "Switch";

export default Switch;
