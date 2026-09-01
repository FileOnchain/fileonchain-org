import type { ChainConfig } from "@fileonchain/sdk";

/**
 * Fire-and-forget nudge to `/api/indexer/ingest` after a pay-as-you-go
 * upload lands, so the "View on FileOnChain explorer" link works
 * immediately instead of 404ing until the next cron scan.
 *
 * Best-effort by design: the cron scan is the safety net, so a failed
 * or dropped request costs nothing but the instant link. `keepalive`
 * lets the request survive the user navigating straight to the
 * explorer page it enables.
 */
export const notifyIndexer = (
  chain: ChainConfig,
  txHashes: ReadonlyArray<string>,
): void => {
  // The ingest endpoint is EVM-only today (mirrors the cron scanner);
  // skip the request entirely for other families.
  if (chain.family !== "evm") return;
  const hashes = txHashes.filter((h) => /^0x[0-9a-fA-F]{64}$/.test(h));
  if (hashes.length === 0) return;
  void fetch("/api/indexer/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chainId: chain.id, txHashes: hashes.slice(0, 25) }),
    keepalive: true,
  }).catch(() => {
    // Swallowed on purpose — see above.
  });
};
