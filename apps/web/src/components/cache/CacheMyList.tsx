"use client";

import * as React from "react";
import { FiLock, FiTrash2, FiUsers } from "react-icons/fi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCacheStates } from "@/states/cache";

interface CacheMyListProps {
  onManageAccess: (id: `0x${string}`) => void;
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

/**
 * CacheMyList — current cache entries with size, expiry, access-list count,
 * and a Manage access button per row.
 */
export const CacheMyList = ({ onManageAccess }: CacheMyListProps) => {
  const entries = useCacheStates((s) => s.entries);
  const removeEntry = useCacheStates((s) => s.removeEntry);

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<FiLock size={20} />}
        title="No cache entries yet"
        description="Buy a private cache tier to encrypt and pin a file or folder."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="private" size="sm" icon={<FiLock />}>
                    Private
                  </Badge>
                  <Badge variant="outline" size="sm">
                    {entry.tier}
                  </Badge>
                </div>
                <p className="text-sm font-medium text-foreground break-all">
                  {entry.filename}
                </p>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <span className="font-mono">{entry.cid.slice(0, 14)}…</span>
                  <CopyButton value={entry.cid} ariaLabel="Copy CID" />
                </div>
              </div>
              <div className="text-right text-xs text-muted">
                <p>{formatSize(entry.sizeBytes)}</p>
                <p>
                  {entry.expiresAt
                    ? `Expires ${new Date(entry.expiresAt * 1000).toLocaleDateString()}`
                    : "Permanent"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<FiUsers size={14} />}
                onClick={() => onManageAccess(entry.id)}
              >
                {entry.allowList.length} grantee{entry.allowList.length === 1 ? "" : "s"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<FiTrash2 size={14} />}
                onClick={() => removeEntry(entry.id)}
                aria-label={`Delete ${entry.filename}`}
              >
                Delete
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
};

export default CacheMyList;