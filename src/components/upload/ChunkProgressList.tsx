"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ChunkData } from "@/utils/generateCIDs";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { cn } from "@/lib/cn";
import { truncateFileName } from "@/utils/truncateFileName";

const FILE_NAME_MAX_LENGTH = 40;

interface ChunkProgressListProps {
  cids: ChunkData[];
  onChunkClick?: (chunk: ChunkData, index: number) => void;
  selectedIndex?: number | null;
  isPrivate?: boolean;
  className?: string;
}

/**
 * ChunkProgressList — visual representation of the file split into CID-tagged
 * chunks. Each row stagger-animates in. Renders empty-state placeholder when
 * no chunks exist (Phase 9 will populate this).
 */
const ChunkProgressList = ({
  cids,
  onChunkClick,
  selectedIndex,
  isPrivate = false,
  className,
}: ChunkProgressListProps) => {
  if (cids.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-border bg-surface/40 p-6 text-center text-sm text-muted",
          className,
        )}
      >
        Chunks will appear here once the file is processed.
      </div>
    );
  }

  return (
    <ul
      role="list"
      className={cn("flex flex-col gap-2", className)}
    >
      {cids.map((chunk, index) => {
        const isSelected = selectedIndex === index;
        const cidStr = chunk.cid.toString();
        return (
          <motion.li
            key={cidStr + index}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.04 }}
          >
            <button
              type="button"
              onClick={() => onChunkClick?.(chunk, index)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border bg-surface px-3 py-2 text-left",
                "transition-colors duration-base ease-out-soft",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-surface-elevated",
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate font-mono text-xs text-foreground" title={cidStr}>
                  {truncateFileName(cidStr, FILE_NAME_MAX_LENGTH)}
                </span>
                <span className="block text-[10px] text-muted">
                  SHA-256 · {chunk.data.byteLength.toLocaleString()} bytes
                </span>
              </span>
              {isPrivate && <Badge variant="private" size="sm">Private</Badge>}
              <CopyButton value={cidStr} ariaLabel={`Copy chunk ${index + 1} CID`} />
            </button>
          </motion.li>
        );
      })}
    </ul>
  );
};

export default ChunkProgressList;