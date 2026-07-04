import * as React from "react";
import type { ChainFamily } from "@fileonchain/sdk";
import { CHAIN_FAMILY_LABELS } from "@fileonchain/sdk";
import { cn } from "@/lib/cn";

const SHORT_CODES: Record<ChainFamily, string> = {
  evm: "EVM",
  substrate: "SUB",
  solana: "SOL",
  aptos: "APT",
  cosmos: "ATOM",
  sui: "SUI",
  starknet: "STRK",
  near: "NEAR",
  tron: "TRX",
  cardano: "ADA",
  ton: "TON",
  hedera: "HBAR",
};

interface RuntimeChipProps {
  family: ChainFamily;
  /** Highlighted chips read as "linked"; muted ones as absent. */
  active?: boolean;
  className?: string;
}

/**
 * RuntimeChip — compact mono badge for a chain family. Mirrors the chain
 * strip chips in the explorer table so runtimes read the same everywhere.
 */
export const RuntimeChip = ({ family, active = true, className }: RuntimeChipProps) => (
  <span
    title={CHAIN_FAMILY_LABELS[family]}
    className={cn(
      "rounded border px-1.5 py-0.5 font-mono text-[10px]",
      active
        ? "border-border bg-surface-elevated text-foreground"
        : "border-dashed border-border text-muted/60 opacity-50",
      className,
    )}
  >
    {SHORT_CODES[family]}
  </span>
);

export default RuntimeChip;
