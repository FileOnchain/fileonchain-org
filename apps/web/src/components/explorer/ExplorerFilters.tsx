"use client";

import * as React from "react";
import { motion } from "framer-motion";
import type { ChainFamily } from "@fileonchain/sdk";
import type { FileCategory } from "@/lib/mock/cid-indexer";
import { cn } from "@/lib/cn";

interface ExplorerFiltersProps {
  runtime: ChainFamily | "all";
  category: FileCategory | "all";
  onRuntimeChange: (f: ChainFamily | "all") => void;
  onCategoryChange: (c: FileCategory | "all") => void;
}

const RUNTIME_OPTIONS: Array<{ id: ChainFamily | "all"; label: string }> = [
  { id: "all", label: "All runtimes" },
  { id: "evm", label: "EVM-compatible" },
  { id: "substrate", label: "Substrate-based" },
  { id: "solana", label: "Solana" },
  { id: "aptos", label: "Aptos" },
];

const CATEGORY_OPTIONS: Array<{ id: FileCategory | "all"; label: string }> = [
  { id: "all", label: "All types" },
  { id: "document", label: "Documents" },
  { id: "data", label: "Data" },
  { id: "image", label: "Images" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "archive", label: "Archives" },
];

/**
 * ExplorerFilters — sticky filter chips above the recent-anchors table.
 * Two pill groups (runtime + category). Selected chip is solid primary;
 * the rest are outlined.
 */
const ExplorerFilters = ({
  runtime,
  category,
  onRuntimeChange,
  onCategoryChange,
}: ExplorerFiltersProps) => (
  <div className="space-y-3">
    <FilterRow
      label="Runtime"
      options={RUNTIME_OPTIONS}
      active={runtime}
      onSelect={onRuntimeChange}
    />
    <FilterRow
      label="File type"
      options={CATEGORY_OPTIONS}
      active={category}
      onSelect={onCategoryChange}
    />
  </div>
);

interface FilterRowProps<T> {
  label: string;
  options: Array<{ id: T; label: string }>;
  active: T;
  onSelect: (id: T) => void;
}

function FilterRow<T extends string>({
  label,
  options,
  active,
  onSelect,
}: FilterRowProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((opt) => {
          const isActive = opt.id === active;
          return (
            <motion.button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              whileTap={{ scale: 0.96 }}
              className={cn(
                "group relative inline-flex h-7 items-center justify-center rounded-full border px-3 text-xs font-medium transition-colors duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground",
              )}
            >
              {opt.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export default ExplorerFilters;
