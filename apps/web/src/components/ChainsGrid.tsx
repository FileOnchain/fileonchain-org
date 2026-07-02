"use client";

import * as React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { FiCheck } from "react-icons/fi";
import {
  CHAINS,
  CHAIN_FAMILY_LABELS,
  CHAIN_FAMILY_TAGLINES,
  type ChainConfig,
} from "@/lib/chains/registry";
import { useChain } from "@/hooks/useChain";
import { Badge } from "@/components/ui/Badge";
import ScrollReveal from "@/components/ScrollReveal";

/**
 * ChainsGrid — editorial grid of every supported chain, grouped by
 * runtime (EVM-compatible, Substrate-based, Solana, Aptos). Each tile
 * shows the icon, full name, runtime tag, native currency, and whether
 * it's a testnet. The active chain gets a highlighted ring. Clicking a
 * tile sets it as the active chain — this keeps the explorer / wallet
 * / upload flow in sync.
 */

const RUNTIMES = ["evm", "substrate", "solana", "aptos"] as const;
type Runtime = (typeof RUNTIMES)[number];

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

interface ChainTileProps {
  chain: ChainConfig;
  active: boolean;
  onSelect: () => void;
}

const ChainTile = ({ chain, active, onSelect }: ChainTileProps) => {
  const iconSrc = `/chains/${chain.shortName.toLowerCase()}.svg`;
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.16, ease: EASE_OUT }}
      aria-pressed={active}
      className={
        "group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border bg-surface p-3 text-left transition-colors duration-base ease-out-soft hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
        (active ? "border-primary bg-primary/5" : "border-border")
      }
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-elevated">
        <Image
          src={iconSrc}
          alt={chain.name}
          width={24}
          height={24}
          className="h-6 w-6 object-cover"
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm font-semibold text-foreground">
            {chain.shortName}
          </span>
          {chain.testnet && (
            <Badge variant="warning" size="sm">
              Testnet
            </Badge>
          )}
          {active && <FiCheck size={14} className="shrink-0 text-success" />}
        </div>
        <span className="block truncate text-[11px] text-muted">
          {chain.name} · {chain.nativeCurrency.symbol}
        </span>
      </div>
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-primary transition-transform duration-base ease-out-soft group-hover:scale-y-100"
      />
    </motion.button>
  );
};

const ChainsGrid = () => {
  const { activeChain, setActiveChainId } = useChain();

  return (
    <ScrollReveal as="section" stagger amount={0.15} className="w-full">
      <header className="mb-8 flex flex-col items-start gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
            Supported chains
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {CHAINS.length} chains across four runtimes.
          </h2>
        </div>
        <p className="max-w-sm text-sm text-muted">
          Each chain runs its own contract. Anchoring the same file on multiple chains
          is optional — and each chain charges its own transaction fees, so redundancy
          has a real cost.
        </p>
      </header>

      <div className="space-y-6">
        {RUNTIMES.map((runtime: Runtime) => {
          const chains = CHAINS.filter((c) => c.family === runtime);
          return (
            <motion.section
              key={runtime}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.5, ease: EASE_OUT },
                },
              }}
              className="rounded-2xl border border-border bg-surface-elevated/40 p-4 md:p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {CHAIN_FAMILY_LABELS[runtime]}
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {chains.length} {chains.length === 1 ? "chain" : "chains"}
                </span>
              </div>
              <p className="mb-3 text-[11px] text-muted/90">
                {CHAIN_FAMILY_TAGLINES[runtime]}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {chains.map((chain) => (
                  <ChainTile
                    key={chain.id}
                    chain={chain}
                    active={chain.id === activeChain.id}
                    onSelect={() => setActiveChainId(chain.id)}
                  />
                ))}
              </div>
            </motion.section>
          );
        })}
      </div>
    </ScrollReveal>
  );
};

export default ChainsGrid;
