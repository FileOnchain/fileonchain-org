"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const SECTIONS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/logs", label: "Logs" },
  { href: "/dashboard/credits", label: "Credits" },
  { href: "/dashboard/focat", label: "FOCAT" },
  { href: "/dashboard/keys", label: "API Keys" },
  { href: "/dashboard/byok", label: "BYOK" },
  { href: "/dashboard/rpc", label: "RPC Endpoints" },
  { href: "/dashboard/preferences", label: "Preferences" },
] as const;

/**
 * DashboardNav — pill tabs across the private dashboard sections. Each
 * section is its own route so pages stay independent server components.
 */
export const DashboardNav = () => {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Dashboard sections"
      className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1"
    >
      {SECTIONS.map((section) => {
        const active = isActive(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-base",
              active
                ? "bg-surface-elevated text-foreground shadow-elev-1"
                : "text-muted hover:text-foreground",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
};

export default DashboardNav;
