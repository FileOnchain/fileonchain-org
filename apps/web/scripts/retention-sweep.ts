#!/usr/bin/env tsx
/**
 * Retention sweep CLI. Single invocation, no cron, no scheduled task —
 * ops runs this manually (or wires it to their scheduler of choice).
 *
 * Usage:
 *   pnpm --filter @fileonchain/web exec tsx scripts/retention-sweep.ts
 *
 * Reads `DATABASE_URL` from the environment; the same Neon Postgres used
 * by the webapp. The sweep deletes every `evidence_envelope` row whose
 * `expires_at < now()`, in batches of 1000.
 */

import { sweepExpiredEnvelopes } from "../src/lib/server/retention";

const main = async () => {
  const result = await sweepExpiredEnvelopes();
  console.log(
    `[retention-sweep] deleted=${result.deleted} at=${new Date().toISOString()}`,
  );
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[retention-sweep] failed", err);
    process.exit(1);
  });
