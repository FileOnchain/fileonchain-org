#!/usr/bin/env tsx
/**
 * Webhook delivery drain CLI. Single invocation, no cron, no scheduled
 * task — ops runs this manually (or wires it to their scheduler of
 * choice).
 *
 * Usage:
 *   pnpm --filter @fileonchain/web exec tsx scripts/webhooks-drain.ts
 *
 * Reads `DATABASE_URL` from the environment; the same Neon Postgres
 * used by the webapp. The drain claims due `webhook_delivery` rows
 * (FOR UPDATE SKIP LOCKED) and POSTs each one to its endpoint with
 * exponential backoff (30s, 5m, 30m, 2h, 8h; capped at 5 attempts).
 * Vercel Cron hits the same logic at `/api/cron/webhooks-drain` every
 * minute.
 */

import { drainDueDeliveries } from "../src/lib/server/webhooks";

const main = async () => {
  const result = await drainDueDeliveries();
  console.log(
    `[webhooks-drain] attempted=${result.attempted} at=${new Date().toISOString()}`,
  );
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[webhooks-drain] failed", err);
    process.exit(1);
  });
