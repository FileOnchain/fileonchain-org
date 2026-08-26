"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { signOut, useSession } from "next-auth/react";
import { FiCreditCard, FiLogOut, FiUser } from "react-icons/fi";
import {
  getFamilyAddress,
  hydrateWalletIdentity,
  useWalletStates,
} from "@/states/wallet";
import { useEnsName } from "@/hooks/useEnsName";
import { Identicon } from "@/components/ui/Identicon";
import { cn } from "@/lib/cn";
import { trackEvent } from "@/lib/analytics";

const ChainConnectModal = dynamic(
  () => import("@/components/chain/ChainConnectModal").then((m) => m.ChainConnectModal),
  { ssr: false },
);

const menuItemClass =
  "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground outline-none hover:bg-surface-elevated data-[highlighted]:bg-surface-elevated";

const chipClass = cn(
  "inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md text-xs md:text-sm font-medium",
  "bg-surface border border-border text-foreground hover:bg-surface-elevated",
  "transition-colors duration-base ease-out-soft",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
);

/**
 * NavAccount — the single identity control in the nav; session and wallet
 * are one surface, not two buttons:
 *
 * - signed out, nothing connected → "Sign in" linking to /login (OAuth +
 *   the same wallet panel the connect modal renders);
 * - signed out, wallet connected → the address chip, opening the connect
 *   modal (sign in with the wallet, public profile shortcut);
 * - signed in → identity chip (username / ENS / short address) opening the
 *   dropdown with dashboard, wallet actions, and sign-out.
 */
export const NavAccount = () => {
  const { data: session, status } = useSession();
  const [connectOpen, setConnectOpen] = React.useState(false);

  // Restore the persisted wallet identity — the nav is on every page, so
  // this is the app-wide hydration point for the wallet store.
  React.useEffect(() => {
    hydrateWalletIdentity();
  }, []);

  const chainFamily = useWalletStates((s) => s.chainFamily);
  const connectedAddress = useWalletStates((s) =>
    getFamilyAddress(s, s.chainFamily),
  );
  const ensName = useEnsName(connectedAddress, chainFamily);
  const shortAddress = connectedAddress
    ? `${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}`
    : null;

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
      <>
        {connectedAddress ? (
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            aria-label="Wallet and sign-in"
            className={chipClass}
          >
            <Identicon value={connectedAddress} size={18} />
            <span
              className={cn(
                "max-w-[140px] truncate",
                !ensName && "font-mono",
              )}
            >
              {ensName ?? shortAddress}
            </span>
          </button>
        ) : (
          <Link
            href="/login"
            className={cn(
              "inline-flex items-center justify-center h-9 px-3 md:px-4 rounded-md text-xs md:text-sm font-medium",
              "bg-primary text-primary-foreground hover:bg-primary-hover",
              "transition-colors duration-base ease-out-soft",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            Sign in
          </Link>
        )}
        <ChainConnectModal open={connectOpen} onOpenChange={setConnectOpen} />
      </>
    );
  }

  const { name, email, image } = session.user;
  // Wallet-created accounts get an auto-generated "0x1234…abcd" name — only
  // a name the user actually chose beats the ENS / address forms.
  const customName = name && !name.includes("…") ? name : null;
  const label =
    customName ?? ensName ?? shortAddress ?? name ?? email ?? "Account";
  const labelIsAddress = !customName && !ensName && Boolean(shortAddress ?? name);
  const initial = (name ?? email ?? "?").slice(0, 1).toUpperCase();

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" aria-label="Account menu" className={chipClass}>
            {image ? (
              <Image
                src={image}
                alt=""
                width={20}
                height={20}
                unoptimized
                className="rounded-full"
              />
            ) : connectedAddress ? (
              <Identicon value={connectedAddress} size={18} />
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated text-[11px] font-semibold">
                {initial}
              </span>
            )}
            <span
              className={cn(
                "max-w-[140px] truncate",
                labelIsAddress && "font-mono",
              )}
            >
              {label}
            </span>
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
                {customName ?? ensName ?? name ?? "Account"}
              </p>
              {email && <p className="truncate text-xs text-muted">{email}</p>}
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item asChild>
              <Link href="/dashboard" className={menuItemClass}>
                <FiUser size={14} aria-hidden />
                Dashboard
              </Link>
            </DropdownMenu.Item>
            {connectedAddress ? (
              <>
                <DropdownMenu.Item asChild>
                  <Link
                    href={`/profile/${encodeURIComponent(connectedAddress)}`}
                    className={menuItemClass}
                  >
                    <Identicon value={connectedAddress} size={14} />
                    <span className="min-w-0">
                      <span className="block">Public profile</span>
                      <span className="block truncate font-mono text-[11px] text-muted">
                        {ensName ?? shortAddress}
                      </span>
                    </span>
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={menuItemClass}
                  onSelect={() => setConnectOpen(true)}
                >
                  <FiCreditCard size={14} aria-hidden />
                  Manage wallet
                </DropdownMenu.Item>
              </>
            ) : (
              <DropdownMenu.Item
                className={menuItemClass}
                onSelect={() => setConnectOpen(true)}
              >
                <FiCreditCard size={14} aria-hidden />
                Connect wallet
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item
              className={menuItemClass}
              onSelect={() => {
                trackEvent("auth_sign_out", {});
                // signOut performs its own navigation to "/" — don't stack a
                // router.refresh() on top (Next 15.0.x Router hook-count bug).
                void signOut({ redirectTo: "/" });
              }}
            >
              <FiLogOut size={14} aria-hidden />
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ChainConnectModal open={connectOpen} onOpenChange={setConnectOpen} />
    </>
  );
};

export default NavAccount;
