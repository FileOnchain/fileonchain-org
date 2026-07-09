"use client";

import * as React from "react";
import { Badge } from "@/components/ui/Badge";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { ChainStatusBadge } from "@/components/chain/ChainStatusBadge";
import {
  SearchSelect,
  type SearchSelectOption,
} from "@/components/ui/SearchSelect";
import {
  CHAIN_FAMILIES,
  CHAIN_FAMILY_LABELS,
  getChain,
  type ChainConfig,
  type ChainId,
} from "@fileonchain/sdk";
import { cn } from "@/lib/cn";

export interface ChainSelectProps {
  /** Chains to offer — pass `useVisibleChains()` or a pre-filtered list. */
  chains: readonly ChainConfig[];
  value: ChainId | null;
  onValueChange: (chainId: ChainId) => void;
  /**
   * `field` — full-width form control (modals, settings forms);
   * `header` / `header-compact` — the Nav switcher's h-9 trigger, with or
   * without the chain name next to the badge.
   */
  variant?: "field" | "header" | "header-compact";
  disabled?: boolean;
  /**
   * Only `status: "active"` chains stay selectable; planned/deprecated
   * ones render with their status badge but disabled. Set this on pickers
   * that feed the upload flow.
   */
  restrictToActive?: boolean;
  id?: string;
  ariaLabel?: string;
}

const testnetBadge = (
  <Badge variant="warning" size="sm">
    Testnet
  </Badge>
);

/**
 * ChainSelect — searchable network picker over a `ChainConfig` list, grouped
 * by runtime in registry order. The single dropdown behind the header
 * ChainSwitcher and every chain-picking form field (RPC endpoints, deposits,
 * donations). Chain data comes from the callers — never hardcode chains here.
 */
export const ChainSelect = ({
  chains,
  value,
  onValueChange,
  variant = "field",
  disabled,
  restrictToActive,
  id,
  ariaLabel = "Select a chain",
}: ChainSelectProps) => {
  const options = React.useMemo<SearchSelectOption[]>(
    () =>
      CHAIN_FAMILIES.flatMap((family) => {
        const familyChains = chains.filter((chain) => chain.family === family);
        // Selectable chains first — with dozens of planned entries, active
        // ones (and their testnets) must not hide below the fold.
        if (restrictToActive) {
          familyChains.sort(
            (a, b) =>
              Number(b.status === "active") - Number(a.status === "active"),
          );
        }
        return familyChains.map((chain) => ({
          value: chain.id,
          label: chain.name,
          group: CHAIN_FAMILY_LABELS[family],
          keywords: [
            chain.shortName,
            chain.family,
            chain.id,
            chain.status,
            ...(chain.testnet ? ["testnet"] : []),
          ],
          leading: (
            <ChainBadge
              chainId={chain.id}
              chainName={chain.name}
              shortName={chain.shortName}
              size="sm"
            />
          ),
          trailing: (
            <span className="flex items-center gap-1">
              <ChainStatusBadge status={chain.status} />
              {chain.testnet && testnetBadge}
            </span>
          ),
          disabled: restrictToActive ? chain.status !== "active" : false,
        }));
      }),
    [chains, restrictToActive],
  );

  // Render the trigger from the registry even when the selected chain isn't
  // in `chains` (e.g. a testnet is active while testnets are hidden).
  const selectedChain =
    (value ? chains.find((chain) => chain.id === value) : undefined) ??
    (value ? getChain(value) : undefined);

  const isHeader = variant !== "field";

  return (
    <SearchSelect
      options={options}
      value={value}
      onValueChange={(next) => onValueChange(next as ChainId)}
      placeholder="Select a chain"
      searchPlaceholder="Search networks…"
      emptyMessage="No matching network."
      disabled={disabled}
      id={id}
      ariaLabel={ariaLabel}
      triggerClassName={
        isHeader
          ? cn("h-9", variant === "header-compact" ? "px-2.5 text-xs" : "px-3 text-sm")
          : undefined
      }
      contentClassName={
        isHeader ? "min-w-[20rem] max-w-[24rem]" : undefined
      }
      renderTrigger={() =>
        selectedChain ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <ChainBadge
              chainId={selectedChain.id}
              chainName={selectedChain.name}
              shortName={selectedChain.shortName}
              size="sm"
            />
            {variant !== "header-compact" && (
              <>
                <span className="truncate font-medium">{selectedChain.name}</span>
                <ChainStatusBadge status={selectedChain.status} />
                {selectedChain.testnet && testnetBadge}
              </>
            )}
          </span>
        ) : (
          <span className="flex-1 text-left text-muted">Select a chain</span>
        )
      }
    />
  );
};

export default ChainSelect;
