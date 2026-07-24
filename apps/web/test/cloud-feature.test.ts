import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_COMPLIANCE_DISABLED_BODY,
  CLOUD_DISABLED_BODY,
  CLOUD_EXPORTS_DISABLED_BODY,
  CLOUD_TENANCY_DISABLED_BODY,
  CLOUD_WEBHOOKS_DISABLED_BODY,
  isCloudComplianceEnabled,
  isCloudEvidenceEnabled,
  isCloudExportsEnabled,
  isCloudTenancyEnabled,
  isCloudWebhooksEnabled,
} from "@/lib/server/cloud-feature";

/** The Cloud gate vocabulary is the single source of truth for which
 *  surfaces are open. Every `/api/v1/*` route + `/cloud/*` page imports
 *  one of these predicates; a flipped default silently reopens a
 *  closed surface. The tests pin the implication chain (tenancy
 *  requires evidence) and the per-surface-disabled bodies so an API
 *  consumer can branch on `code` without string-matching. */

const EVIDENCE = "FILEONCHAIN_CLOUD_EVIDENCE_ENABLED";
const TENANCY = "FILEONCHAIN_CLOUD_TENANCY_ENABLED";
const WEBHOOKS = "FILEONCHAIN_CLOUD_WEBHOOKS_ENABLED";
const EXPORTS = "FILEONCHAIN_CLOUD_EXPORTS_ENABLED";
const COMPLIANCE = "FILEONCHAIN_CLOUD_COMPLIANCE_ENABLED";

afterEach(() => {
  // `vi.stubEnv` is restored per-test, but call `unstubEnvs` for any
  // env set via direct mutation elsewhere — and so a future test that
  // forgets to wrap a stub still does not leak state across cases.
  vi.unstubAllEnvs();
});

describe("Cloud feature flags — defaults", () => {
  it("every Cloud gate is OFF when no env vars are set", () => {
    expect(isCloudEvidenceEnabled()).toBe(false);
    expect(isCloudTenancyEnabled()).toBe(false);
    expect(isCloudWebhooksEnabled()).toBe(false);
    expect(isCloudExportsEnabled()).toBe(false);
    expect(isCloudComplianceEnabled()).toBe(false);
  });

  it("only the literal '1' flips a flag on (anything else is OFF)", () => {
    vi.stubEnv(EVIDENCE, "true");
    expect(isCloudEvidenceEnabled()).toBe(false);
    vi.stubEnv(EVIDENCE, "1");
    expect(isCloudEvidenceEnabled()).toBe(true);
  });
});

describe("isCloudEvidenceEnabled", () => {
  it("flips on when FILEONCHAIN_CLOUD_EVIDENCE_ENABLED=1", () => {
    vi.stubEnv(EVIDENCE, "1");
    expect(isCloudEvidenceEnabled()).toBe(true);
  });

  it("flips off again as soon as the env is unset", () => {
    vi.stubEnv(EVIDENCE, "1");
    expect(isCloudEvidenceEnabled()).toBe(true);
    vi.stubEnv(EVIDENCE, "");
    expect(isCloudEvidenceEnabled()).toBe(false);
  });
});

describe("isCloudTenancyEnabled — implication chain", () => {
  it("requires BOTH evidence AND tenancy to be on", () => {
    vi.stubEnv(EVIDENCE, "1");
    // Tenancy alone is not enough — a tenant must also be on the
    // broader Cloud evidence surface.
    expect(isCloudTenancyEnabled()).toBe(false);
    vi.stubEnv(TENANCY, "1");
    expect(isCloudTenancyEnabled()).toBe(true);
  });

  it("stays off when evidence is off even with tenancy on", () => {
    vi.stubEnv(TENANCY, "1");
    expect(isCloudTenancyEnabled()).toBe(false);
  });

  it("stays off when the evidence env is reset to empty", () => {
    vi.stubEnv(EVIDENCE, "1");
    vi.stubEnv(TENANCY, "1");
    expect(isCloudTenancyEnabled()).toBe(true);
    vi.stubEnv(EVIDENCE, "");
    expect(isCloudTenancyEnabled()).toBe(false);
  });
});

describe("independent surface flags", () => {
  it("isCloudWebhooksEnabled is independent of evidence + tenancy", () => {
    vi.stubEnv(EVIDENCE, "");
    vi.stubEnv(TENANCY, "");
    vi.stubEnv(WEBHOOKS, "1");
    expect(isCloudWebhooksEnabled()).toBe(true);
    expect(isCloudEvidenceEnabled()).toBe(false);
    expect(isCloudTenancyEnabled()).toBe(false);
  });

  it("isCloudExportsEnabled is independent of every other flag", () => {
    vi.stubEnv(EXPORTS, "1");
    expect(isCloudExportsEnabled()).toBe(true);
    expect(isCloudEvidenceEnabled()).toBe(false);
    expect(isCloudWebhooksEnabled()).toBe(false);
  });

  it("isCloudComplianceEnabled is independent of every other flag", () => {
    vi.stubEnv(COMPLIANCE, "1");
    expect(isCloudComplianceEnabled()).toBe(true);
    expect(isCloudEvidenceEnabled()).toBe(false);
    expect(isCloudExportsEnabled()).toBe(false);
  });
});

describe("CLOUD_*_DISABLED_BODY shapes", () => {
  it("every body shares the same `code: not_implemented` so consumers branch on it", () => {
    for (const body of [
      CLOUD_DISABLED_BODY,
      CLOUD_TENANCY_DISABLED_BODY,
      CLOUD_WEBHOOKS_DISABLED_BODY,
      CLOUD_EXPORTS_DISABLED_BODY,
      CLOUD_COMPLIANCE_DISABLED_BODY,
    ]) {
      expect(body.code).toBe("not_implemented");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    }
  });

  it("the per-surface bodies are distinct from the generic Cloud body", () => {
    // The tenancy / webhooks / exports / compliance bodies each name
    // their own surface so an API consumer reading just the error
    // string knows which switch to flip on the server side.
    expect(CLOUD_TENANCY_DISABLED_BODY).not.toBe(CLOUD_DISABLED_BODY);
    expect(CLOUD_WEBHOOKS_DISABLED_BODY).not.toBe(CLOUD_DISABLED_BODY);
    expect(CLOUD_EXPORTS_DISABLED_BODY).not.toBe(CLOUD_DISABLED_BODY);
    expect(CLOUD_COMPLIANCE_DISABLED_BODY).not.toBe(CLOUD_DISABLED_BODY);
    expect(CLOUD_TENANCY_DISABLED_BODY.error).toMatch(/project|tenanc/i);
    expect(CLOUD_WEBHOOKS_DISABLED_BODY.error).toMatch(/webhook/i);
    expect(CLOUD_EXPORTS_DISABLED_BODY.error).toMatch(/export/i);
    expect(CLOUD_COMPLIANCE_DISABLED_BODY.error).toMatch(/compliance/i);
  });
});
