"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FiCheck, FiChevronDown } from "react-icons/fi";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { Badge } from "@/components/ui/Badge";
import { useChain } from "@/hooks/useChain";
import { CHAINS, CHAIN_FAMILY_LABELS, type ChainConfig } from "@fileonchain/sdk";
import { cn } from "@/lib/cn";

interface ChainSwitcherProps {
  variant?: "compact" | "full";
}

/**
 * ChainSwitcher — Radix DropdownMenu that lists every supported chain
 * grouped by runtime (EVM-compatible, Substrate-based, Solana, Aptos).
 * Picking a chain writes it to the active-chain store, which then drives
 * the wallet modal and any cost estimate surfaces.
 */
export const ChainSwitcher = ({ variant = "full" }: ChainSwitcherProps) => {
  const { activeChain, setActiveChainId } = useChain();

  const groups = React.useMemo(() => {
    const runtimes: Array<"evm" | "substrate" | "solana" | "aptos"> = [
      "evm",
      "substrate",
      "solana",
      "aptos",
    ];
    return runtimes.map((runtime) => ({
      runtime,
      label: CHAIN_FAMILY_LABELS[runtime],
      chains: CHAINS.filter((c) => c.family === runtime),
    }));
  }, []);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Switch active chain"
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-border bg-surface text-foreground hover:bg-surface-elevated transition-colors duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            variant === "compact" ? "h-9 px-2.5 text-xs" : "h-9 px-3 text-sm",
          )}
        >
          <ChainBadge
            chainId={activeChain.id}
            chainName={activeChain.name}
            shortName={activeChain.shortName}
            size="sm"
          />
          {variant === "full" && (
            <>
              <span className="font-medium">{activeChain.name}</span>
              {activeChain.testnet && (
                <Badge variant="warning" size="sm">
                  Testnet
                </Badge>
              )}
            </>
          )}
          <FiChevronDown size={14} className="text-muted" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-50 min-w-[20rem] rounded-lg border border-border bg-surface-elevated p-1 shadow-elev-3 animate-fade-in"
        >
          {groups.map((group) => (
            <div key={group.runtime} className="mb-1">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                {group.label}
              </p>
              {group.chains.map((chain: ChainConfig) => (
                <DropdownMenu.Item
                  key={chain.id}
                  onSelect={() => setActiveChainId(chain.id)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none",
                    "hover:bg-surface focus:bg-surface",
                  )}
                >
                  <ChainBadge
                    chainId={chain.id}
                    chainName={chain.name}
                    shortName={chain.shortName}
                    size="sm"
                  />
                  <span className="flex-1 truncate text-foreground">
                    {chain.name}
                  </span>
                  {chain.testnet && (
                    <Badge variant="warning" size="sm">
                      Testnet
                    </Badge>
                  )}
                  {chain.id === activeChain.id && (
                    <FiCheck size={14} className="text-success" />
                  )}
                </DropdownMenu.Item>
              ))}
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default ChainSwitcher;