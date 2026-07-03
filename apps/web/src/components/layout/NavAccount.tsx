"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { signOut, useSession } from "next-auth/react";
import { FiLogOut, FiUser } from "react-icons/fi";
import { cn } from "@/lib/cn";
import { trackEvent } from "@/lib/analytics";

/**
 * NavAccount — session-aware account button next to NavWallet. Signed out it
 * links to /login; signed in it opens a dropdown with the dashboard link and
 * sign-out. Wallet connection (NavWallet) is independent of the session.
 */
export const NavAccount = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === "loading") {
    return (
      <span
        aria-hidden
        className="hidden sm:inline-flex h-9 w-9 rounded-full bg-surface-elevated animate-pulse"
      />
    );
  }

  if (!session?.user) {
    return (
      <Link
        href="/login"
        className={cn(
          "inline-flex items-center justify-center h-9 px-3 rounded-md text-xs md:text-sm font-medium",
          "bg-surface border border-border text-foreground hover:bg-surface-elevated",
          "transition-colors duration-base ease-out-soft",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        Sign in
      </Link>
    );
  }

  const { name, email, image } = session.user;
  const initial = (name ?? email ?? "?").slice(0, 1).toUpperCase();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full",
            "border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface-elevated",
            "transition-colors duration-base ease-out-soft",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          {image ? (
            <Image src={image} alt="" width={36} height={36} unoptimized />
          ) : (
            initial
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[200px] rounded-lg border border-border bg-surface p-1.5 shadow-elev-2"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-foreground">
              {name ?? "Account"}
            </p>
            {email && <p className="truncate text-xs text-muted">{email}</p>}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild>
            <Link
              href="/dashboard"
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground outline-none hover:bg-surface-elevated data-[highlighted]:bg-surface-elevated"
            >
              <FiUser size={14} aria-hidden />
              Dashboard
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground outline-none hover:bg-surface-elevated data-[highlighted]:bg-surface-elevated"
            onSelect={() => {
              trackEvent("auth_sign_out", {});
              void signOut({ redirectTo: "/" }).then(() => router.refresh());
            }}
          >
            <FiLogOut size={14} aria-hidden />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default NavAccount;
