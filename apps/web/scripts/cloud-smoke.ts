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
 *   # + the deep envelope round-trip section (opt-in):
 *   FILEONCHAIN_SMOKE_DEEP=1 \
 *   pnpm --filter @fileonchain/web exec tsx scripts/cloud-smoke.ts
 *
 * The default run is the per-flag gate profile above. With
 * `FILEONCHAIN_SMOKE_DEEP=1`, after the per-flag loop the script
 * posts a deterministic Agent Evidence Profile envelope (built by
 * `lib/server/cloud-smoke-envelope.ts`), GETs it back, searches for
 * it by subject sha256, runs the server-side verifier on the
 * stored row, and reads the canary org's effective retention window
 * (printed as a `INFO  canary retention` line as the cleanup
 * reminder). The deep section is skipped with one line if the
 * EVIDENCE flag is off in the target env.
 *
 * The script exits with code 0 if every check matches the expected
 * profile, 1 otherwise. The output is line-oriented so ops can pipe to
 * `grep`/`cut` without parsing JSON.
 */

import { buildCloudSmokeEnvelope } from "../src/lib/server/cloud-smoke-envelope";

const BASE_URL = process.env.FILEONCHAIN_SMOKE_BASE_URL ?? "http://localhost:3000";
const API_KEY = process.env.FILEONCHAIN_SMOKE_API_KEY ?? "";
const DEEP_ENABLED = process.env.FILEONCHAIN_SMOKE_DEEP === "1";

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

interface DeepResult {
  passed: number;
  failed: number;
  skipped: number;
}

interface SubmittedEnvelope {
  envelopeId: string;
  envelopeDigest: string;
}

const runDeepSection = async (
  evidenceEnabled: boolean,
): Promise<DeepResult> => {
  const out: DeepResult = { passed: 0, failed: 0, skipped: 0 };
  console.log("\n[deep]");

  if (!evidenceEnabled) {
    console.log(
      "  SKIP  FILEONCHAIN_CLOUD_EVIDENCE_ENABLED is off — flip it to 1 in the target env to run the deep section",
    );
    out.skipped++;
    return out;
  }
  if (!API_KEY) {
    console.log("  SKIP  FILEONCHAIN_SMOKE_API_KEY is not set — auth would 401 every call");
    out.skipped++;
    return out;
  }

  const log = (status: "PASS" | "FAIL", step: string, info: string) => {
    console.log(`  ${status}  ${step}  ${info}`);
    if (status === "PASS") out.passed++;
    else out.failed++;
  };

  // Authenticated JSON request helper. 503 with the gate's
  // `code: not_implemented` is treated as a "the surface flipped off
  // between the per-flag loop and now" soft fail, so the per-flag
  // check is the source of truth for the gate and the deep section
  // just walks the ingest path.
  const request = async (
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: () => Promise<unknown>; text: string }> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(`${BASE_URL}${path}`, init);
    const text = await response.text();
    return {
      status: response.status,
      json: async () => (text.length === 0 ? null : JSON.parse(text)),
      text,
    };
  };

  try {
    // 1. Build the deterministic envelope locally.
    const envelope = await buildCloudSmokeEnvelope();
    const expectedDigest = envelope.envelope?.digest.sha256 ?? "";
    const expectedSubjectSha256 = envelope.subject.digests?.sha256 ?? "";
    if (!expectedDigest || !expectedSubjectSha256) {
      log("FAIL", "buildCloudSmokeEnvelope", "missing envelope digest or subject sha256");
      return out;
    }
    console.log(
      `  INFO  built envelope digest=${expectedDigest.slice(0, 12)}… subjectSha256=${expectedSubjectSha256.slice(0, 12)}…`,
    );

    // 2. POST /api/v1/evidence.
    const submit = await request("POST", "/api/v1/evidence", { envelope });
    if (submit.status !== 200) {
      log("FAIL", "POST /api/v1/evidence", `status=${submit.status} body=${submit.text.slice(0, 200)}`);
      return out;
    }
    const submitJson = (await submit.json()) as Partial<SubmittedEnvelope>;
    if (
      typeof submitJson.envelopeId !== "string" ||
      typeof submitJson.envelopeDigest !== "string"
    ) {
      log("FAIL", "POST /api/v1/evidence", "response missing envelopeId/envelopeDigest");
      return out;
    }
    const envelopeId = submitJson.envelopeId;
    const serverDigest = submitJson.envelopeDigest;
    if (serverDigest !== expectedDigest) {
      log(
        "FAIL",
        "POST /api/v1/evidence",
        `envelopeId=${envelopeId} serverDigest=${serverDigest.slice(0, 12)}… expected=${expectedDigest.slice(0, 12)}…`,
      );
      return out;
    }
    log(
      "PASS",
      "POST /api/v1/evidence",
      `envelopeId=${envelopeId} digestMatch=true`,
    );

    // 3. GET /api/v1/evidence/:id — subject + digest must round-trip.
    const get = await request("GET", `/api/v1/evidence/${envelopeId}`);
    if (get.status !== 200) {
      log("FAIL", `GET /api/v1/evidence/${envelopeId}`, `status=${get.status}`);
      return out;
    }
    const getJson = (await get.json()) as {
      subjectSha256?: string;
      envelopeDigest?: string;
    };
    const subjectOk = getJson.subjectSha256 === expectedSubjectSha256;
    const digestOk = getJson.envelopeDigest === expectedDigest;
    if (!subjectOk || !digestOk) {
      log(
        "FAIL",
        `GET /api/v1/evidence/${envelopeId}`,
        `subjectMatch=${subjectOk} digestMatch=${digestOk}`,
      );
      return out;
    }
    log(
      "PASS",
      `GET /api/v1/evidence/${envelopeId}`,
      "subject+digest round-trip",
    );

    // 4. GET /api/v1/evidence?query=<subjectSha256> — the search index
    //    must include the just-submitted row.
    const search = await request(
      "GET",
      `/api/v1/evidence?query=${expectedSubjectSha256}`,
    );
    if (search.status !== 200) {
      log("FAIL", "GET /api/v1/evidence?query=…", `status=${search.status}`);
      return out;
    }
    const searchJson = (await search.json()) as {
      hits?: Array<{ envelopeId?: string }>;
    };
    const hits = Array.isArray(searchJson.hits) ? searchJson.hits : [];
    const found = hits.some((h) => h.envelopeId === envelopeId);
    if (!found) {
      log("FAIL", "GET /api/v1/evidence?query=…", `hits=${hits.length} found=0`);
      return out;
    }
    log(
      "PASS",
      "GET /api/v1/evidence?query=…",
      `hits=${hits.length} found=1`,
    );

    // 5. POST /api/v1/verify with the stored envelopeId — the server
    //    runs the same `@fileonchain/verify` the hosted page does.
    //    Any `status` other than `invalid` is acceptable here; the
    //    smoke is checking that the route runs, not that the smoke
    //    envelope has every receipt pinned.
    const verify = await request("POST", "/api/v1/verify", { envelopeId });
    if (verify.status !== 200) {
      log("FAIL", "POST /api/v1/verify", `status=${verify.status}`);
      return out;
    }
    const report = (await verify.json()) as { status?: string };
    if (typeof report.status !== "string" || report.status === "invalid") {
      log(
        "FAIL",
        "POST /api/v1/verify",
        `report.status=${report.status ?? "missing"}`,
      );
      return out;
    }
    log("PASS", "POST /api/v1/verify", `report.status=${report.status}`);

    // 6. GET /api/v1/retention — the canary reminder. Operators
    //    should set this to 1 day so the daily retention sweep
    //    purges the smoke envelope the day after the smoke runs.
    const retention = await request("GET", "/api/v1/retention");
    if (retention.status !== 200) {
      log("FAIL", "GET /api/v1/retention", `status=${retention.status}`);
      return out;
    }
    const retentionJson = (await retention.json()) as {
      windowDays?: number;
      source?: string;
    };
    if (typeof retentionJson.windowDays !== "number") {
      log("FAIL", "GET /api/v1/retention", "response missing windowDays");
      return out;
    }
    console.log(
      `  INFO  canary retention windowDays=${retentionJson.windowDays} source=${retentionJson.source ?? "unknown"} — set 1 day so the daily cron purges the smoke envelope`,
    );
    log(
      "PASS",
      "GET /api/v1/retention",
      `windowDays=${retentionJson.windowDays}`,
    );
  } catch (err) {
    log("FAIL", "deep", `error=${(err as Error).message}`);
  }
  return out;
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
  // The deep section walks the evidence ingest path. It only runs when
  // the EVIDENCE flag is observed to be on in the per-flag loop; the
  // `evidence` surface check (GET /api/v1/evidence) is the canary.
  let evidenceEnabled = false;

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
          if (
            check.flag === "FILEONCHAIN_CLOUD_EVIDENCE_ENABLED" &&
            check.surface === "evidence"
          ) {
            evidenceEnabled = true;
          }
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

  if (DEEP_ENABLED) {
    const deep = await runDeepSection(evidenceEnabled);
    passed += deep.passed;
    failed += deep.failed;
    skipped += deep.skipped;
  }

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
