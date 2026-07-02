import * as React from "react";
import { cn } from "@/lib/cn";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
  fullWidth?: boolean;
}

/**
 * Input — text entry primitive. Pair `label` for accessibility, `error` to
 * surface validation, `leftAddon`/`rightAddon` for currency symbols, copy
 * buttons, etc.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error,
      leftAddon,
      rightAddon,
      fullWidth = false,
      className,
      id,
      ...rest
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const describedById = hint || error ? `${inputId}-desc` : undefined;

    return (
      <div className={cn("flex flex-col gap-1.5", fullWidth && "w-full")}>
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border bg-surface px-3 h-10",
            "transition-colors duration-base ease-out-soft",
            "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
            error ? "border-danger" : "border-border",
          )}
        >
          {leftAddon && <span className="text-muted shrink-0">{leftAddon}</span>}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={describedById}
            className={cn(
              "flex-1 bg-transparent text-sm text-foreground placeholder:text-muted",
              "focus:outline-none disabled:opacity-60",
              className,
            )}
            {...rest}
          />
          {rightAddon && <span className="text-muted shrink-0">{rightAddon}</span>}
        </div>
        {(hint || error) && (
          <p
            id={describedById}
            className={cn("text-xs", error ? "text-danger" : "text-muted")}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export default Input;