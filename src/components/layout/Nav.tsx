"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { FiMenu, FiX } from "react-icons/fi";
import { cn } from "@/lib/cn";
import ThemeSwitch from "@/components/ThemeSwitch";
import ChainSwitcher from "@/components/chain/ChainSwitcher";
import NavWallet from "@/components/layout/NavWallet";

interface NavLink {
  href: string;
  label: string;
}

const PRIMARY_LINKS: NavLink[] = [
  { href: "/", label: "Upload" },
  { href: "/explorer", label: "Explorer" },
  { href: "/cache", label: "Cache" },
  { href: "/donations", label: "Donations" },
  { href: "/dashboard", label: "Dashboard" },
];

/**
 * Nav — sticky top navigation. Renders primary links, the chain switcher,
 * the wallet button, and the theme toggle. Collapses to a hamburger menu
 * below the `md` breakpoint.
 */
const Nav = () => {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:gap-6 md:px-6">
        <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="FileOnChain home">
          <Image
            src="/logo/svg/fileonchain-logo-white-blue.svg"
            alt=""
            width={28}
            height={28}
            className="dark:hidden"
            priority
          />
          <Image
            src="/logo/svg/fileonchain-logo-clear-blue.svg"
            alt=""
            width={28}
            height={28}
            className="hidden dark:block"
            priority
          />
          <span className="hidden font-semibold text-foreground sm:inline">FileOnChain</span>
        </Link>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
          {PRIMARY_LINKS.map((link) => {
            const active =
              pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-base",
                  active
                    ? "bg-surface-elevated text-foreground"
                    : "text-muted hover:text-foreground hover:bg-surface",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:block">
            <ChainSwitcher />
          </div>
          <NavWallet />
          <ThemeSwitch />

          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-foreground hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {mobileOpen ? <FiX size={18} /> : <FiMenu size={18} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav aria-label="Primary mobile" className="md:hidden border-t border-border bg-surface">
          <ul className="mx-auto flex max-w-7xl flex-col gap-1 p-2">
            <li>
              <div className="px-3 py-2">
                <ChainSwitcher />
              </div>
            </li>
            {PRIMARY_LINKS.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-surface-elevated text-foreground"
                        : "text-muted hover:text-foreground hover:bg-surface-elevated",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

    </header>
  );
};

export default Nav;