import * as React from "react";
import { cn } from "@/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "outlined";
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm: "p-3",
  md: "p-4 md:p-5",
  lg: "p-6 md:p-8",
} as const;

const variantClasses = {
  default: "bg-surface border border-border",
  elevated: "bg-surface-elevated border border-border shadow-elev-1",
  outlined: "bg-transparent border border-border",
} as const;

/**
 * Card — surface container for grouped content. Set `interactive` to enable
 * hover affordances used by clickable cards in the explorer and dashboard.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    { variant = "default", interactive = false, padding = "md", className, children, ...rest },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg transition-colors duration-base ease-out-soft",
          variantClasses[variant],
          paddingClasses[padding],
          interactive &&
            "cursor-pointer hover:border-primary/40 hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";

export const CardHeader = ({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mb-3 flex items-start justify-between gap-3", className)} {...rest}>
    {children}
  </div>
);

export const CardTitle = ({ className, children, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("text-base font-semibold text-foreground", className)} {...rest}>
    {children}
  </h3>
);

export const CardDescription = ({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-sm text-muted", className)} {...rest}>
    {children}
  </p>
);

export default Card;