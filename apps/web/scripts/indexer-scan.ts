#!/usr/bin/env tsx
/**
 * Indexer scan CLI. Single invocation, no cron, no scheduled task —
 * ops runs this manually (or wires it to their scheduler of choice).
 *
 * Usage:
 *   pnpm --filter @fileonchain/web exec tsx scripts/indexer-scan.ts
 *
 * Pulls `CIDAnchored` + `ChunkAnchored` events from every provisioned
 * EVM chain's `FileRegistry` contract and upserts them into
 * `indexed_anchor_event`. Reads `DATABASE_URL` from the environment
 * (the same Neon Postgres used by the webapp) and the chain RPC URLs
 * from the chain registry (`packages/utils/src/chains.ts`).
 */

import { runIndexerScan } from "../src/lib/server/indexer";

const main = async () => {
  const report = await runIndexerScan();
  console.log(
    `[indexer-scan] totalEventsAdded=${report.totalEventsAdded} chains=${report.chains.length} at=${new Date().toISOString()}`,
  );
  for (const r of report.chains) {
    console.log(
      `  ${r.chainId}: from=${r.fromBlock} to=${r.toBlock} added=${r.eventsAdded}`,
    );
  }
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[indexer-scan] failed", err);
    process.exit(1);
  });