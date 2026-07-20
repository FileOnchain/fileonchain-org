#!/usr/bin/env tsx
/**
 * USDC deposit watcher CLI. Single invocation, no cron, no scheduled
 * task — ops runs this manually (or wires it to their scheduler of
 * choice).
 *
 * Usage:
 *   pnpm --filter @fileonchain/web exec tsx scripts/deposits-watch.ts
 *
 * Reads `DATABASE_URL` from the environment; the same Neon Postgres
 * used by the webapp. Walks every EVM chain whose `usdcContract` is
 * provisioned, matches inbound `Transfer` events against the pending
 * `deposit` rows, and credits the matched users.
 */

import { runDepositWatch } from "../src/lib/server/deposits";

const main = async () => {
  const report = await runDepositWatch();
  console.log(
    `[deposits-watch] totalConfirmed=${report.totalConfirmed} chains=${report.chains.length} at=${new Date().toISOString()}`,
  );
  for (const r of report.chains) {
    console.log(
      `  ${r.chainId}: from=${r.fromBlock} to=${r.toBlock} confirmed=${r.confirmed}`,
    );
  }
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[deposits-watch] failed", err);
    process.exit(1);
  });