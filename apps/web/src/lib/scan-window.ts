/**
 * Shared constants for the per-chain EVM `getLogs` scanners — the
 * indexer (`lib/indexer/scan.ts`) and the deposit watcher
 * (`lib/server/deposits.ts`). Both walk `cursor + 1 → head` in fixed
 * windows so a long RPC outage cannot produce a multi-day range
 * request that the provider rejects.
 *
 * `SCAN_WINDOW_BLOCKS` is hard-coded at `9_999` for v1 — the largest
 * block range that survives every public RPC's max-range filter
 * without pagination. Safe on every supported EVM chain:
 *
 *   - Sepolia (~12s blocks): 9_999 blocks ≈ 33h
 *   - Auto EVM Chronos (~2s blocks): 9_999 blocks ≈ 5.5h
 *
 * If a future chain ships a lower cap or much higher block time, lift
 * this into env rather than threading a magic number through every
 * scanner.
 */

/** Maximum block range scanned per cron tick. */
export const SCAN_WINDOW_BLOCKS = 9_999;

/** Block-tag used by `getBlock` so the cap above catches up to the
 *  latest finalized block instead of `latest`. A reorg that drops a
 *  finalized block is impossible by definition, so the unique
 *  `(chain, tx, log)` index guarantees the worst case is a re-read
 *  next tick, not a missing row. */
export const CONFIRMED_TAG = "finalized" as const;

/** viem `http()` transport options shared by every EVM scanner +
 *  the manual-confirm route. Caps each request so a hung RPC can't
 *  stall a cron tick, and retries on transient failures (the most
 *  common being rate-limit responses from public providers). */
export const RPC_TRANSPORT_OPTS = {
  /** Per-request timeout. A slow RPC is treated as a failure after
   *  this many ms so a cron tick always completes within the
   *  Vercel-function budget (60s on Hobby, 300s on Pro). */
  timeout: 15_000,
  /** Retry transient RPC errors (network reset, 5xx, rate-limit).
   *  `retryCount` includes the original attempt; viem exposes
   *  `retryDelay` for exponential backoff. */
  retryCount: 3,
  retryDelay: 500,
} as const;
