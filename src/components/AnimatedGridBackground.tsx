import { cn } from "@/lib/cn";

interface AnimatedGridBackgroundProps {
  className?: string;
}

/**
 * AnimatedGridBackground — full-bleed CSS grid backdrop with a soft pulsing
 * opacity and a radial mask so the edges fade out. Used behind the home
 * hero to anchor the "crypto / onchain" aesthetic.
 */
const AnimatedGridBackground = ({ className }: AnimatedGridBackgroundProps) => (
  <div
    aria-hidden
    className={cn(
      "pointer-events-none absolute inset-0 -z-10 bg-grid bg-grid-fade animate-grid-pulse",
      className,
    )}
  />
);

export default AnimatedGridBackground;