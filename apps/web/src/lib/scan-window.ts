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

/** Block-tag used by `getLogs` / `getBlockNumber` so the cap above
 *  catches up to the latest finalized block instead of `latest`. A
 *  reorg that drops a finalized block is impossible by definition, so
 *  the unique `(chain, tx, log)` index guarantees the worst case is
 *  a re-read next tick, not a missing row. */
export const CONFIRMED_TAG = "finalized" as const;
