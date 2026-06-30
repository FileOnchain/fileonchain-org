"use client";

import * as React from "react";
import { motion } from "framer-motion";
import type { ChainFamily } from "@/types/types";
import type { FileCategory } from "@/lib/mock/cid-indexer";
import { cn } from "@/lib/cn";

interface ExplorerFiltersProps {
  family: ChainFamily | "all";
  category: FileCategory | "all";
  onFamilyChange: (f: ChainFamily | "all") => void;
  onCategoryChange: (c: FileCategory | "all") => void;
}

const FAMILY_OPTIONS: Array<{ id: ChainFamily | "all"; label: string }> = [
  { id: "all", label: "All families" },
  { id: "evm", label: "EVM" },
  { id: "substrate", label: "Substrate" },
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
 * Two pill groups (family + category). Selected chip is solid primary;
 * the rest are outlined. Chip pills underline-animate on hover.
 */
const ExplorerFilters = ({
  family,
  category,
  onFamilyChange,
  onCategoryChange,
}: ExplorerFiltersProps) => (
  <div className="space-y-3">
    <FilterRow
      label="Chain family"
      options={FAMILY_OPTIONS}
      active={family}
      onSelect={onFamilyChange}
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
