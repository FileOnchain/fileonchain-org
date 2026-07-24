#!/usr/bin/env tsx
/**
 * Monthly compliance report build CLI. Single invocation, no cron, no
 * scheduled task — ops runs this manually (or wires it to their
 * scheduler of choice).
 *
 * Usage:
 *   pnpm --filter @fileonchain/web exec tsx scripts/compliance-reports-build.ts
 *
 * Reads `DATABASE_URL` from the environment; the same Neon Postgres
 * used by the webapp. Builds the previous-calendar-month signed
 * Evidence Envelope for every org with at least one envelope, and
 * stores it as a `compliance_report` row. Vercel Cron hits the same
 * logic at `/api/cron/compliance-reports-build` at 04:00 UTC on the
 * 1st of every month.
 *
 * The first run after the FILEONCHAIN_CLOUD_COMPLIANCE_ENABLED flag
 * flips on covers the in-progress calendar month up to `now` only
 * when the cron includes a catch-up flag — confirm with the deploy
 * runbook before opening the surface to paying tenants.
 */

import { generateMonthlyReportsForAllOrgs } from "../src/lib/server/compliance";

const main = async () => {
  const result = await generateMonthlyReportsForAllOrgs();
  console.log(
    `[compliance-reports-build] orgs=${result.orgs} reportsWritten=${result.reportsWritten} at=${new Date().toISOString()}`,
  );
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[compliance-reports-build] failed", err);
    process.exit(1);
  });
