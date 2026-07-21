#!/usr/bin/env tsx
/**
 * Rate-limit sweep CLI. Single invocation, no cron, no scheduled task —
 * ops runs this manually (or wires it to their scheduler of choice).
 *
 * Usage:
 *   pnpm --filter @fileonchain/web exec tsx scripts/rate-limit-sweep.ts
 *
 * Reads `DATABASE_URL` from the environment; the same Neon Postgres used
 * by the webapp. Deletes every `rate_limit_window` row whose window has
 * been closed for at least two minutes (the keep-window is fixed at 2
 * so the limit can still be enforced across the boundary minute).
 */

import { sweepExpiredRateLimitWindows } from "../src/lib/server/rate-limit-sweep";

const main = async () => {
  const result = await sweepExpiredRateLimitWindows();
  console.log(
    `[rate-limit-sweep] deleted=${result.deleted} at=${new Date().toISOString()}`,
  );
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[rate-limit-sweep] failed", err);
    process.exit(1);
  });