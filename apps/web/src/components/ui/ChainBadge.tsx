import * as React from "react";
import Image from "next/image";
import { getChain } from "@fileonchain/sdk";
import { cn } from "@/lib/cn";

interface ChainBadgeProps {
  chainId?: string;
  chainName?: string;
  shortName?: string;
  icon?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { box: "h-5 w-5", text: "text-[10px]", padding: "px-1.5 py-0.5" },
  md: { box: "h-6 w-6", text: "text-xs", padding: "px-2 py-0.5" },
  lg: { box: "h-8 w-8", text: "text-sm", padding: "px-2.5 py-1" },
} as const;

/**
 * ChainBadge — pill rendering a chain icon (or initials) + short name. The
 * icon comes from the chain registry (`chain.icon`, looked up by `chainId`)
 * unless explicitly overridden — never derived from the symbol, which would
 * duplicate the registry's asset mapping and 404 on most chains.
 */
export const ChainBadge = ({
  chainId,
  chainName,
  shortName,
  icon,
  size = "md",
  className,
}: ChainBadgeProps) => {
  const sizes = sizeMap[size];
  const fallbackIcon = shortName?.slice(0, 3).toUpperCase();
  const iconSrc = icon ?? (chainId ? (getChain(chainId)?.icon ?? null) : null);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface",
        sizes.padding,
        className,
      )}
      title={chainName ?? chainId}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-primary/10 text-primary font-semibold overflow-hidden",
          sizes.box,
          sizes.text,
        )}
      >
        {iconSrc ? (
          <Image src={iconSrc} alt={chainName ?? shortName ?? "chain"} width={24} height={24} className="h-full w-full object-cover" />
        ) : (
          fallbackIcon
        )}
      </span>
      {shortName && <span className={cn("font-medium text-foreground", sizes.text)}>{shortName}</span>}
    </span>
  );
};

export default ChainBadge;