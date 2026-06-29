"use client";

import * as React from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
  className?: string;
}

/**
 * Tooltip — accessible hover/focus tooltip. Wrap any interactive element.
 */
export const TooltipProvider = ({ children }: { children: React.ReactNode }) => (
  <RadixTooltip.Provider delayDuration={200} skipDelayDuration={100}>
    {children}
  </RadixTooltip.Provider>
);

export const Tooltip = ({
  content,
  children,
  side = "top",
  delayDuration = 200,
  className,
}: TooltipProps) => (
  <RadixTooltip.Root delayDuration={delayDuration}>
    <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        side={side}
        sideOffset={6}
        className={cn(
          "z-50 rounded-md border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-foreground shadow-elev-2",
          "data-[state=delayed-open]:animate-fade-in",
          className,
        )}
      >
        {content}
        <RadixTooltip.Arrow className="fill-surface-elevated" />
      </RadixTooltip.Content>
    </RadixTooltip.Portal>
  </RadixTooltip.Root>
);

export default Tooltip;