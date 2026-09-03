"use client";

import * as React from "react";
import { FiChevronDown, FiChevronUp, FiSearch } from "react-icons/fi";
import {
  CHAIN_FAMILY_LABELS,
  CHAIN_STATUS_LABELS,
  INTEGRATION_STATUS_LABELS,
  INTEGRATION_STATUS_ORDER,
  getIntegrationStatus,
  isChainActive,
  type ChainConfig,
  type ChainFamily,
  type ChainStatus,
} from "@fileonchain/sdk";
import Badge from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";

type SortKey = "name" | "family" | "availability" | "integration";
type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Network" },
  { key: "family", label: "Family" },
  { key: "availability", label: "Availability" },
  { key: "integration", label: "Integration status" },
];

// Active chains first when sorting ascending by availability.
const AVAILABILITY_RANK: Record<ChainStatus, number> = {
  active: 0,
  planned: 1,
  deprecated: 2,
};

const integrationRank = (chain: ChainConfig): number =>
  INTEGRATION_STATUS_ORDER.indexOf(getIntegrationStatus(chain));

const COMPARATORS: Record<SortKey, (a: ChainConfig, b: ChainConfig) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  family: (a, b) =>
    CHAIN_FAMILY_LABELS[a.family].localeCompare(CHAIN_FAMILY_LABELS[b.family]),
  availability: (a, b) => AVAILABILITY_RANK[a.status] - AVAILABILITY_RANK[b.status],
  integration: (a, b) => integrationRank(a) - integrationRank(b),
};

const integrationBadgeVariant = (chain: ChainConfig) => {
  const status = getIntegrationStatus(chain);
  return status === "webapp-integrated" || status === "production-ready" || status === "audited"
    ? ("success" as const)
    : status === "testnet-deployed" || status === "mainnet-deployed"
      ? ("info" as const)
      : ("warning" as const);
};

interface NetworkTableProps {
  chains: readonly ChainConfig[];
  /** Accessible name for the table and its filter controls. */
  label: string;
}

/**
 * NetworkTable — the registry-driven network listing on /integrations,
 * with client-side search, family/availability filters, and sortable
 * columns. The data is exactly the `ChainConfig` rows the server passes
 * in; the default (unsorted) order is registry order.
 */
const NetworkTable = ({ chains, label }: NetworkTableProps) => {
  const [query, setQuery] = React.useState("");
  const [family, setFamily] = React.useState<ChainFamily | "all">("all");
  const [availability, setAvailability] = React.useState<ChainStatus | "all">("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: SortDir } | null>(null);

  // Only offer the families and availabilities this table actually holds.
  const familyOptions = React.useMemo(
    () => Array.from(new Set(chains.map((c) => c.family))),
    [chains],
  );
  const availabilityOptions = React.useMemo(
    () => Array.from(new Set(chains.map((c) => c.status))),
    [chains],
  );

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = chains.filter((chain) => {
      if (family !== "all" && chain.family !== family) return false;
      if (availability !== "all" && chain.status !== availability) return false;
      if (!q) return true;
      return (
        chain.name.toLowerCase().includes(q) ||
        chain.shortName.toLowerCase().includes(q) ||
        chain.id.toLowerCase().includes(q) ||
        CHAIN_FAMILY_LABELS[chain.family].toLowerCase().includes(q)
      );
    });
    if (!sort) return filtered;
    const compare = COMPARATORS[sort.key];
    return [...filtered].sort((a, b) => {
      const order = compare(a, b) || a.name.localeCompare(b.name);
      return sort.dir === "asc" ? order : -order;
    });
  }, [chains, query, family, availability, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current?.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  const filtersActive = query.trim() !== "" || family !== "all" || availability !== "all";

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search networks…"
          aria-label={`Search ${label}`}
          leftAddon={<FiSearch size={14} aria-hidden="true" />}
          fullWidth
        />
        <div className="flex gap-2">
          <Select
            value={family}
            onChange={(e) => setFamily(e.target.value as ChainFamily | "all")}
            aria-label={`Filter ${label} by family`}
            className="w-auto min-w-[10rem]"
          >
            <option value="all">All families</option>
            {familyOptions.map((f) => (
              <option key={f} value={f}>
                {CHAIN_FAMILY_LABELS[f]}
              </option>
            ))}
          </Select>
          <Select
            value={availability}
            onChange={(e) => setAvailability(e.target.value as ChainStatus | "all")}
            aria-label={`Filter ${label} by availability`}
            className="w-auto min-w-[10rem]"
          >
            <option value="all">All availability</option>
            {availabilityOptions.map((s) => (
              <option key={s} value={s}>
                {CHAIN_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted" aria-live="polite">
        Showing {rows.length} of {chains.length} networks
        {filtersActive && (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFamily("all");
                setAvailability("all");
              }}
              className="text-primary underline underline-offset-2 hover:no-underline"
            >
              Reset filters
            </button>
          </>
        )}
      </p>

      <div className="mt-2 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-left text-sm" aria-label={label}>
          <thead>
            <tr className="border-b border-border bg-surface-elevated/60">
              {COLUMNS.map((column) => {
                const isSorted = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    aria-sort={
                      isSorted ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
                    }
                    className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={cn(
                        "inline-flex items-center gap-1 uppercase tracking-[0.18em] transition-colors duration-base ease-out-soft",
                        "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        isSorted && "text-foreground",
                      )}
                    >
                      {column.label}
                      {isSorted &&
                        (sort.dir === "asc" ? (
                          <FiChevronUp size={12} aria-hidden="true" />
                        ) : (
                          <FiChevronDown size={12} aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-muted">
                  No networks match these filters.
                </td>
              </tr>
            ) : (
              rows.map((chain) => (
                <tr key={chain.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {chain.name}
                    {chain.testnet && (
                      <span className="ml-2 font-mono text-[10px] uppercase text-muted">
                        testnet
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{CHAIN_FAMILY_LABELS[chain.family]}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Badge variant={isChainActive(chain) ? "success" : "outline"} size="sm">
                      {CHAIN_STATUS_LABELS[chain.status]}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Badge variant={integrationBadgeVariant(chain)} size="sm">
                      {INTEGRATION_STATUS_LABELS[getIntegrationStatus(chain)]}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default NetworkTable;
