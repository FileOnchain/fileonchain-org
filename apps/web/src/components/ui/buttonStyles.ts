export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Shared button styling — one source of truth for Button (real <button>s)
 * and ButtonLink (next/link navigation styled as an action), so the two
 * are visually indistinguishable. Server-safe: no client code, importable
 * from Server Components.
 */
export const buttonBaseClasses =
  "inline-flex items-center justify-center font-medium " +
  "transition-colors duration-base ease-out-soft " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const buttonVariantClasses: Record<ButtonVariant, string> = {
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

export const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-md gap-2",
  lg: "h-12 px-6 text-base rounded-lg gap-2.5",
};
