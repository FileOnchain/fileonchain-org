"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ACTIVE_FAMILIES,
  CHAIN_FAMILY_LABELS,
  type ChainFamily,
} from "@fileonchain/sdk";
import { cn } from "@/lib/cn";

interface ExplorerFiltersProps {
  runtime: ChainFamily | "all";
  basePath: string;
}

// Only runtimes with a network open for uploads — the indexer never reports
// anchors on planned families, so their chips would always filter to nothing.
const RUNTIME_OPTIONS: Array<{ id: ChainFamily | "all"; label: string }> = [
  { id: "all", label: "All runtimes" },
  ...ACTIVE_FAMILIES.map((family) => ({
    id: family,
    label: CHAIN_FAMILY_LABELS[family],
  })),
];

/**
 * ExplorerFilters — sticky filter chips above the recent-anchors table.
 * Pure links: clicking a chip navigates to `basePath?runtime=X` for a
 * full reload that re-runs the indexer query server-side.
 *
 * The category filter was dropped when the indexer moved to on-chain
 * data: categories imply off-chain file metadata (name, MIME) which we
 * don't attest to.
 */
const ExplorerFilters = ({ runtime, basePath }: ExplorerFiltersProps) => (
  <div className="space-y-3">
    <FilterRow label="Runtime" options={RUNTIME_OPTIONS} active={runtime} basePath={basePath} />
  </div>
);

interface FilterRowProps<T extends string> {
  label: string;
  options: Array<{ id: T; label: string }>;
  active: T;
  basePath: string;
}

function FilterRow<T extends string>({
  label,
  options,
  active,
  basePath,
}: FilterRowProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((opt) => {
          const isActive = opt.id === active;
          const href = opt.id === "all" ? basePath : `${basePath}?runtime=${opt.id}`;
          return (
            <motion.div key={opt.id} whileTap={{ scale: 0.96 }}>
              <Link
                href={href}
                scroll={false}
                className={cn(
                  "group relative inline-flex h-7 items-center justify-center rounded-full border px-3 text-xs font-medium transition-colors duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground",
                )}
              >
                {opt.label}
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default ExplorerFilters;
