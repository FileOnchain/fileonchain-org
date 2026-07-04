"use client";

import * as React from "react";
import { FiChevronDown } from "react-icons/fi";
import { cn } from "@/lib/cn";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  fullWidth?: boolean;
}

/**
 * Select — a styled native `<select>` with the Input family's label/hint
 * treatment. Pass `<option>` children as usual.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, fullWidth, className, id, children, ...rest }, ref) => {
    const autoId = React.useId();
    const selectId = id ?? autoId;
    const hintId = hint ? `${selectId}-hint` : undefined;

    return (
      <div className={cn("flex flex-col gap-1.5", fullWidth && "w-full")}>
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-describedby={hintId}
            className={cn(
              "h-10 w-full appearance-none rounded-md border border-border bg-surface pl-3 pr-9 text-sm text-foreground",
              "transition-colors duration-base hover:bg-surface-elevated",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
            {...rest}
          >
            {children}
          </select>
          <FiChevronDown
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          />
        </div>
        {hint && (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        )}
      </div>
    );
  },
);
Select.displayName = "Select";

export default Select;
