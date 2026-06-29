/**
 * Helpers for rendering CIDs in the UI. Always treats the input as opaque
 * base32 lowercase — never re-encodes.
 */

const SHORT_PREFIX = 8;
const SHORT_SUFFIX = 6;

export const truncateCID = (cid: string, prefixLen = SHORT_PREFIX, suffixLen = SHORT_SUFFIX): string => {
  if (cid.length <= prefixLen + suffixLen + 1) return cid;
  return `${cid.slice(0, prefixLen)}…${cid.slice(-suffixLen)}`;
};

export const formatTimestamp = (ts: number): string => new Date(ts * 1000).toLocaleString();

export const formatBlockNumber = (n: number): string => n.toLocaleString();