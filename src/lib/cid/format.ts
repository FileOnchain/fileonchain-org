/**
 * Helpers for rendering CIDs and file metadata in the explorer UI.
 * Treat CIDs as opaque base32 lowercase — never re-encode them.
 */

const SHORT_PREFIX = 8;
const SHORT_SUFFIX = 6;

export const truncateCID = (cid: string, prefixLen = SHORT_PREFIX, suffixLen = SHORT_SUFFIX): string => {
  if (cid.length <= prefixLen + suffixLen + 1) return cid;
  return `${cid.slice(0, prefixLen)}…${cid.slice(-suffixLen)}`;
};

export const truncateAddress = (addr: string, side = 6): string => {
  if (addr.length <= side * 2 + 1) return addr;
  return `${addr.slice(0, side)}…${addr.slice(-side)}`;
};

export const formatTimestamp = (ts: number): string =>
  new Date(ts * 1000).toLocaleString();

export const formatBlockNumber = (n: number): string => n.toLocaleString();

export const formatBytes = (bytes: number, decimals = 1): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(decimals).replace(/\.0$/, "")} ${units[i]}`;
};

/** Relative time formatter — "3s", "12m", "5h", "2d", "Mar 14". */
export const formatRelativeTime = (ts: number, now: number = Date.now()): string => {
  const diffSec = Math.max(0, Math.round((now - ts * 1000) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

/** Compact large-number formatter used by the explorer counters. */
export const compactNumber = (n: number, decimals = 1): string => {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(decimals)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(decimals)}K`;
  return n.toLocaleString();
};
