import * as React from "react";
import { cn } from "@/lib/cn";

interface IdenticonProps {
  value: string;
  size?: number;
  className?: string;
  rounded?: boolean;
}

/**
 * Identicon — deterministic gradient avatar derived from a hash of `value`.
 * Lightweight client-only visual used to disambiguate addresses and CIDs
 * without any external dependencies.
 */
export const Identicon = ({ value, size = 32, className, rounded = true }: IdenticonProps) => {
  const hash = React.useMemo(() => {
    let h1 = 0;
    let h2 = 0;
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      h1 = (h1 * 31 + c) >>> 0;
      h2 = (h2 * 17 + c) >>> 0;
    }
    return { h1, h2 };
  }, [value]);

  const hue1 = hash.h1 % 360;
  const hue2 = hash.h2 % 360;
  const initials = value.slice(0, 2).toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-semibold text-white",
        rounded ? "rounded-full" : "rounded-md",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.floor(size / 2.6)),
        background: `linear-gradient(135deg, hsl(${hue1}, 70%, 45%), hsl(${hue2}, 70%, 35%))`,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
};

export default Identicon;