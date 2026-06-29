"use client";

import * as React from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Tabs — Radix Tabs primitive styled to match the FileOnChain tokens. Use the
 * compound API: `<Tabs><TabsList>...</TabsList><TabsContent value="...">...</TabsContent></Tabs>`.
 */
export const Tabs = ({ value, onValueChange, children, className }: TabsProps) => (
  <RadixTabs.Root value={value} onValueChange={onValueChange} className={cn("w-full", className)}>
    {children}
  </RadixTabs.Root>
);

export const TabsList = React.forwardRef<
  React.ElementRef<typeof RadixTabs.List>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.List>
>(({ className, children, ...rest }, ref) => (
  <RadixTabs.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1",
      className,
    )}
    {...rest}
  >
    {children}
  </RadixTabs.List>
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger> & { icon?: React.ReactNode }
>(({ className, icon, children, ...rest }, ref) => (
  <RadixTabs.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
      "text-muted hover:text-foreground transition-colors duration-base",
      "data-[state=active]:bg-surface-elevated data-[state=active]:text-foreground",
      "data-[state=active]:shadow-elev-1",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      className,
    )}
    {...rest}
  >
    {icon}
    {children}
  </RadixTabs.Trigger>
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(({ className, children, ...rest }, ref) => (
  <RadixTabs.Content
    ref={ref}
    className={cn("mt-5 focus-visible:outline-none animate-fade-up", className)}
    {...rest}
  >
    {children}
  </RadixTabs.Content>
));
TabsContent.displayName = "TabsContent";

export default Tabs;