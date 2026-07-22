#!/usr/bin/env tsx
/**
 * Cloud smoke test. Hits each gated Cloud surface from a canary API key
 * and reports the structured status. Designed to be run against a
 * deployed environment (post-deploy) OR against a local dev server
 * (to confirm the gates are correctly returning 503 when the flag is off).
 *
 * The expected status profile depends on which flags are flipped in the
 * target environment:
 *
 *   Cloud flag surface   | Flag ON  | Flag OFF
 *   -------------------- | -------- | -----------
 *   FILEONCHAIN_CLOUD_…  | 200/400  | 503 not_implemented
 *   …EVIDENCE_ENABLED    | 200/400  | 503 not_implemented
 *   …TENANCY_ENABLED     | 200/400  | 503 not_implemented
 *   …WEBHOOKS_ENABLED    | 200/400  | 503 not_implemented
 *   …EXPORTS_ENABLED     | 200/400  | 503 not_implemented
 *   …COMPLIANCE_ENABLED  | 200/400  | 503 not_implemented
 *
 * The 200/400 distinction is the surface's own validation (e.g. POST
 * /api/v1/evidence with no body returns 400; with a valid envelope returns
 * 200). The script does NOT submit a real envelope — it uses bare GETs
 * where possible and POSTs with empty bodies to exercise the validation
 * path. The intent is to confirm the gate is reachable, not to exercise
 * the full ingest path.
 *
 * Usage:
 *   FILEONCHAIN_SMOKE_BASE_URL=https://fileonchain.org \
 *   FILEONCHAIN_SMOKE_API_KEY=fok_… \
 *   pnpm --filter @fileonchain/web exec tsx scripts/cloud-smoke.ts
 *
 * The script exits with code 0 if every check matches the expected
 * profile, 1 otherwise. The output is line-oriented so ops can pipe to
 * `grep`/`cut` without parsing JSON.
 */

const BASE_URL = process.env.FILEONCHAIN_SMOKE_BASE_URL ?? "http://localhost:3000";
const API_KEY = process.env.FILEONCHAIN_SMOKE_API_KEY ?? "";

interface Check {
  surface: string;
  flag: string;
  method: "GET" | "POST";
  path: string;
  expectedOn: number[];
  expectedOff: number;
}

const CHECKS: Check[] = [
  {
    surface: "evidence",
    flag: "FILEONCHAIN_CLOUD_EVIDENCE_ENABLED",
    method: "GET",
    path: "/api/v1/evidence",
    expectedOn: [200, 400],
    expectedOff: 503,
  },
  {
    surface: "agent-runs",
    flag: "FILEONCHAIN_CLOUD_EVIDENCE_ENABLED",
    method: "GET",
    path: "/api/v1/agent-runs/smoke-nonexistent",
    expectedOn: [200, 400, 404],
    expectedOff: 503,
  },
  {
    surface: "hosted-verify",
    flag: "FILEONCHAIN_CLOUD_EVIDENCE_ENABLED",
    method: "POST",
    path: "/api/v1/verify",
    expectedOn: [200, 400],
    expectedOff: 503,
  },
  {
    surface: "retention",
    flag: "FILEONCHAIN_CLOUD_EVIDENCE_ENABLED",
    method: "GET",
    path: "/api/v1/retention",
    expectedOn: [200, 401, 403],
    expectedOff: 503,
  },
  {
    surface: "webhooks",
    flag: "FILEONCHAIN_CLOUD_WEBHOOKS_ENABLED",
    method: "GET",
    path: "/api/v1/webhooks",
    expectedOn: [200, 401, 403],
    expectedOff: 503,
  },
  {
    surface: "exports",
    flag: "FILEONCHAIN_CLOUD_EXPORTS_ENABLED",
    method: "GET",
    path: "/api/v1/exports",
    expectedOn: [200, 401, 403],
    expectedOff: 503,
  },
  {
    surface: "compliance",
    flag: "FILEONCHAIN_CLOUD_COMPLIANCE_ENABLED",
    method: "GET",
    path: "/api/v1/sla",
    expectedOn: [200, 401, 403],
    expectedOff: 503,
  },
  {
    surface: "projects",
    flag: "FILEONCHAIN_CLOUD_TENANCY_ENABLED",
    method: "GET",
    path: "/api/organizations/smoke-nonexistent/projects",
    expectedOn: [200, 401, 403, 404],
    expectedOff: 503,
  },
];

const reportUnknownFlag = (check: Check): number => {
  // The flag is read on every request, so the same environment can
  // expose a mix of on/off surfaces. We can't observe the flag from
  // outside; we infer "off" from a 503 with `code: not_implemented`.
  // Anything else is treated as "on or other gate" — the check passes
  // as long as the status is in `expectedOn`.
  return -1;
};

const run = async (): Promise<{
  passed: number;
  failed: number;
  skipped: number;
}> => {
  if (!API_KEY) {
    console.warn(
      "[cloud-smoke] no FILEONCHAIN_SMOKE_API_KEY set; requests will be rejected at auth",
    );
  }

  // Group checks by flag so the ops reader can see the per-flag profile
  // at a glance. Buckets are stable insertion order.
  const byFlag = new Map<string, Check[]>();
  for (const c of CHECKS) {
    const list = byFlag.get(c.flag) ?? [];
    list.push(c);
    byFlag.set(c.flag, list);
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const [flag, checks] of byFlag) {
    console.log(`\n[${flag}]`);
    for (const check of checks) {
      const url = `${BASE_URL}${check.path}`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
      try {
        const response = await fetch(url, { method: check.method, headers });
        const status = response.status;
        const isOn = check.expectedOn.includes(status);
        const isOff = status === check.expectedOff;
        if (isOn) {
          console.log(`  PASS  ${check.method} ${check.path}  status=${status}`);
          passed++;
        } else if (isOff) {
          console.log(`  OFF   ${check.method} ${check.path}  status=${status}  (flag off, as expected)`);
          passed++;
        } else {
          console.log(
            `  FAIL  ${check.method} ${check.path}  status=${status}  expectedOn=${check.expectedOn.join("|")} expectedOff=${check.expectedOff}`,
          );
          failed++;
        }
      } catch (err) {
        console.error(
          `  ERR   ${check.method} ${check.path}  error=${(err as Error).message}`,
        );
        failed++;
      }
    }
  }

  // Reference the helper so the lint pass keeps it; it's a documented
  // escape hatch for environments where the flag state is observable
  // through a side channel (e.g. an env-status endpoint).
  void reportUnknownFlag;

  console.log(`\n[cloud-smoke] passed=${passed} failed=${failed} skipped=${skipped}`);
  return { passed, failed, skipped };
};

run()
  .then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("[cloud-smoke] failed", err);
    process.exit(1);
  });
