"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useWalletStates } from "@/states/wallet";
import { cn } from "@/lib/cn";

const ChainConnectModal = dynamic(
  () => import("@/components/chain/ChainConnectModal").then((m) => m.ChainConnectModal),
  { ssr: false },
);

/**
 * NavWallet — wallet connect button + modal pair. The modal is loaded
 * dynamically with `ssr: false` so the @solana/web3.js and @aptos-labs/ts-sdk
 * bundles never execute in the Node SSR environment.
 */
export const NavWallet = () => {
  const [open, setOpen] = React.useState(false);

  const chainFamily = useWalletStates((s) => s.chainFamily);
  const evmAddress = useWalletStates((s) => s.evmAddress);
  const solanaAddress = useWalletStates((s) => s.solanaAddress);
  const aptosAddress = useWalletStates((s) => s.aptosAddress);
  const substrateAccount = useWalletStates((s) => s.selectedAccount);

  const connectedAddress =
    chainFamily === "evm"
      ? evmAddress
      : chainFamily === "solana"
        ? solanaAddress
        : chainFamily === "aptos"
          ? aptosAddress
          : substrateAccount?.address ?? null;

  const label = connectedAddress
    ? `${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}`
    : "Connect Wallet";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Connect wallet"
        className={cn(
          "inline-flex items-center justify-center h-9 px-3 md:px-4 rounded-md text-xs md:text-sm font-medium",
          connectedAddress
            ? "bg-surface border border-border text-foreground hover:bg-surface-elevated font-mono"
            : "bg-primary text-primary-foreground hover:bg-primary-hover",
          "transition-colors duration-base ease-out-soft",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {label}
      </button>
      <ChainConnectModal open={open} onOpenChange={setOpen} />
    </>
  );
};

export default NavWallet;