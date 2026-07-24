#!/usr/bin/env tsx
/**
 * Bulk export job sweep CLI. Single invocation, no cron, no scheduled
 * task — ops runs this manually (or wires it to their scheduler of
 * choice).
 *
 * Usage:
 *   pnpm --filter @fileonchain/web exec tsx scripts/exports-sweep.ts
 *
 * Reads `DATABASE_URL` from the environment; the same Neon Postgres
 * used by the webapp. The sweep marks `export_job` rows past their
 * 24h download window as expired and deletes the on-disk TAR files
 * associated with them. Vercel Cron hits the same logic at
 * `/api/cron/exports-sweep` at 03:37 UTC daily.
 */

import { sweepExpiredExportJobs } from "../src/lib/server/exports";

const main = async () => {
  const result = await sweepExpiredExportJobs();
  console.log(
    `[exports-sweep] deleted=${result.deleted} at=${new Date().toISOString()}`,
  );
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[exports-sweep] failed", err);
    process.exit(1);
  });
