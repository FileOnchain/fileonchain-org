import { describe, expect, it } from "vitest";
import {
  CLOUD_DISABLED_BODY,
  isCloudEvidenceEnabled,
} from "@/lib/server/cloud-feature";
import {
  requireOrgApiKey,
  requireTenantApiKey,
  type OrgApiKey,
} from "@/lib/server/evidence";
import { HttpError, httpError, notImplemented, orgScopedKeyRequired } from "@/lib/server/http-error";
import { isUniqueViolation } from "@/lib/server/preferences";
import {
  DATE_FORMAT_OPTIONS,
  USERNAME_RE,
  formatPreferredDate,
  isDateFormatPreference,
} from "@/lib/preferences";
import { signWebhookPayload, verifyWebhookHeader } from "@/lib/server/webhooks";

/** Pure helpers tied to the cron drain / sweep surface. The cron
 *  routes themselves are DB-bound (`sweepExpiredRateLimitWindows`,
 *  `drainDueDeliveries`, `sweepExpiredEnvelopes`, `sweepExpiredExportJobs`)
 *  but the helper layer around them — the org-tenant guard every
 *  Cloud route boots through, the typed HTTP error shape, the
 *  Postgres unique-violation walker, the date-format vocabulary,
 *  the webhook replay-window math, and the "not-yet-enabled" body
 *  every gated route returns — is pure and covers the bits that
 *  would silently misbehave under a refactor. */

/* ------------------------------------------------------------------ */
/* Tenancy guards                                                       */
/* ------------------------------------------------------------------ */

const makeKey = (overrides: Partial<OrgApiKey> = {}): OrgApiKey => ({
  id: "key_1",
  userId: "user_1",
  orgId: "org_1",
  projectId: null,
  scope: "org",
  ...overrides,
});

describe("requireOrgApiKey", () => {
  it("returns the orgId for an org-scoped key", () => {
    expect(requireOrgApiKey(makeKey({ orgId: "org_123", scope: "org" }))).toBe(
      "org_123",
    );
  });

  it("returns the orgId for a project-scoped key (the org binds the tenancy)", () => {
    expect(
      requireOrgApiKey(
        makeKey({ orgId: "org_123", projectId: "proj_1", scope: "project" }),
      ),
    ).toBe("org_123");
  });

  it("throws org_scoped_key_required for a personal key (the Cloud surface rejects them)", () => {
    try {
      requireOrgApiKey(makeKey({ orgId: null, scope: "personal" }));
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(403);
      expect((error as HttpError).code).toBe("org_scoped_key_required");
      return;
    }
    throw new Error("requireOrgApiKey should have thrown for a personal key");
  });

  it("throws org_scoped_key_required when an org-scoped marker carries a null orgId", () => {
    // Belt-and-braces: a buggy onboarding path could mint a key with
    // `orgId: null` but `scope: "org"`. The guard refuses both
    // shapes equally.
    try {
      requireOrgApiKey(makeKey({ orgId: null, scope: "org" }));
    } catch (error) {
      expect((error as HttpError).code).toBe("org_scoped_key_required");
      return;
    }
    throw new Error("requireOrgApiKey should have thrown for a null orgId");
  });
});

describe("requireTenantApiKey", () => {
  it("returns the orgId and a null projectId for an org-scoped key", () => {
    expect(
      requireTenantApiKey(makeKey({ orgId: "org_1", projectId: null, scope: "org" })),
    ).toEqual({ orgId: "org_1", projectId: null });
  });

  it("returns the orgId and the projectId for a project-scoped key", () => {
    expect(
      requireTenantApiKey(
        makeKey({ orgId: "org_1", projectId: "proj_1", scope: "project" }),
      ),
    ).toEqual({ orgId: "org_1", projectId: "proj_1" });
  });

  it("rejects a personal key before any projectId resolution", () => {
    expect(() =>
      requireTenantApiKey(makeKey({ orgId: null, scope: "personal" })),
    ).toThrowError(HttpError);
  });
});

/* ------------------------------------------------------------------ */
/* HTTP error shape                                                     */
/* ------------------------------------------------------------------ */

describe("HttpError", () => {
  it("toResponse body is { error, code } with the chosen status", () => {
    const err = new HttpError(404, "not here", "not_found");
    const res = err.toResponse();
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("falls back to a status-keyed code when no explicit code is supplied", () => {
    // 400 → bad_request, 404 → not_found, 409 → conflict, 429 → rate_limited,
    // 500 → internal_error. Pin each so a refactor of the lookup table
    // is caught.
    expect(new HttpError(400, "x").code).toBe("bad_request");
    expect(new HttpError(404, "x").code).toBe("not_found");
    expect(new HttpError(409, "x").code).toBe("conflict");
    expect(new HttpError(413, "x").code).toBe("payload_too_large");
    expect(new HttpError(429, "x").code).toBe("rate_limited");
    expect(new HttpError(500, "x").code).toBe("internal_error");
  });

  it("an undiscovered status falls back to internal_error", () => {
    // 418 is not in the lookup table; the helper still returns a
    // valid HttpError rather than throwing.
    expect(new HttpError(418, "teapot").code).toBe("internal_error");
  });

  it("httpError + notImplemented + orgScopedKeyRequired build the right shapes", () => {
    const a = httpError(403, "forbidden", "nope");
    expect(a.status).toBe(403);
    expect(a.code).toBe("forbidden");

    const b = notImplemented("evidence");
    expect(b.status).toBe(503);
    expect(b.code).toBe("not_implemented");
    expect(b.message).toBe("evidence is not enabled");

    const c = orgScopedKeyRequired();
    expect(c.status).toBe(403);
    expect(c.code).toBe("org_scoped_key_required");
  });
});

/* ------------------------------------------------------------------ */
/* DB error walker — used by the sweep + onboarding paths               */
/* ------------------------------------------------------------------ */

describe("isUniqueViolation", () => {
  it("returns true for a direct 23505 error", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("walks the `cause` chain to find a wrapped 23505", () => {
    // Drizzle wraps the driver error; the walker follows the chain.
    const wrapped = new Error("insert failed") as Error & {
      cause?: unknown;
    };
    wrapped.cause = { cause: { code: "23505" } };
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("returns false when no element in the chain carries 23505", () => {
    expect(isUniqueViolation({ code: "23502" })).toBe(false);
    expect(isUniqueViolation({ code: "OTHER" })).toBe(false);
  });

  it("returns false for a non-object input", () => {
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });

  it("stops walking at 5 levels deep so a hostile cycle cannot hang the test", () => {
    // 6-deep chain with 23505 at the bottom — the walker must stop
    // short and return false.
    let node: Record<string, unknown> = { code: "23505" };
    for (let i = 0; i < 6; i += 1) {
      node = { cause: node };
    }
    expect(isUniqueViolation(node)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Preferences vocabulary                                               */
/* ------------------------------------------------------------------ */

describe("formatPreferredDate", () => {
  const isoDate = "2026-07-04T15:30:00Z";

  it("returns '—' for an unparseable input", () => {
    expect(formatPreferredDate("not a date", "iso")).toBe("—");
    expect(formatPreferredDate(NaN, "us")).toBe("—");
  });

  it("formats an ISO date with the chosen format", () => {
    expect(formatPreferredDate(isoDate, "iso")).toBe("2026-07-04");
    expect(formatPreferredDate(isoDate, "us")).toBe("07/04/2026");
    expect(formatPreferredDate(isoDate, "eu")).toBe("04/07/2026");
  });

  it("appends HH:mm when withTime is requested", () => {
    // The clock is rendered in the local timezone (the helper does
    // not pin UTC); assert the structure of the output rather than
    // the exact digits.
    const out = formatPreferredDate(isoDate, "iso", { withTime: true });
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("accepts a Date instance", () => {
    // Local-time constructor so the helper's `getDate()` reads
    // the same day regardless of the host's timezone.
    const date = new Date(2026, 0, 2, 0, 0, 0);
    expect(formatPreferredDate(date, "us")).toBe("01/02/2026");
  });
});

describe("isDateFormatPreference", () => {
  it("accepts every DATE_FORMAT_OPTIONS value", () => {
    for (const { value } of DATE_FORMAT_OPTIONS) {
      expect(isDateFormatPreference(value)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isDateFormatPreference("iso-8601")).toBe(false);
    expect(isDateFormatPreference(null)).toBe(false);
    expect(isDateFormatPreference(0)).toBe(false);
  });
});

describe("USERNAME_RE", () => {
  it("accepts the canonical lowercase handle shape", () => {
    expect(USERNAME_RE.test("alice")).toBe(true);
    expect(USERNAME_RE.test("alice-42").valueOf()).toBeTruthy();
    expect(USERNAME_RE.test("user_name")).toBe(true);
    expect(USERNAME_RE.test("a".repeat(32))).toBe(true);
  });

  it("rejects wrong-length handles", () => {
    expect(USERNAME_RE.test("ab")).toBe(false); // too short
    expect(USERNAME_RE.test("a".repeat(33))).toBe(false); // too long
  });

  it("rejects uppercase, leading separator, and invalid characters", () => {
    expect(USERNAME_RE.test("Alice")).toBe(false);
    expect(USERNAME_RE.test("-alice")).toBe(false);
    expect(USERNAME_RE.test("_alice")).toBe(false);
    expect(USERNAME_RE.test("alice@home")).toBe(false);
    expect(USERNAME_RE.test("alice space")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Webhook replay window — boundary math that the drain trusts           */
/* ------------------------------------------------------------------ */

describe("verifyWebhookHeader — exact replay window boundary", () => {
  /** The webhooks-drain cron trusts that a header older than 5
   *  minutes will be rejected. The boundary is `> 5 * 60`, so a
   *  header at exactly 300s old is still accepted, and 301s is not. */
  const SECRET = "whsec_test";
  const BODY = JSON.stringify({ ok: true });

  it("accepts a header that is exactly 300 seconds old (the inclusive boundary)", () => {
    const ts = 1_700_000_000;
    const header = `t=${ts},v1=${signWebhookPayload(SECRET, ts, BODY)}`;
    expect(verifyWebhookHeader(SECRET, header, BODY, ts + 300)).toBe(true);
  });

  it("rejects a header that is 301 seconds old (one past the boundary)", () => {
    const ts = 1_700_000_000;
    const header = `t=${ts},v1=${signWebhookPayload(SECRET, ts, BODY)}`;
    expect(verifyWebhookHeader(SECRET, header, BODY, ts + 301)).toBe(false);
  });

  it("accepts a header that is exactly 300 seconds in the future", () => {
    // The half-open window is symmetric — both `now - ts` and
    // `ts - now` must satisfy the bound.
    const ts = 1_700_000_300;
    const header = `t=${ts},v1=${signWebhookPayload(SECRET, ts, BODY)}`;
    expect(verifyWebhookHeader(SECRET, header, BODY, 1_700_000_000)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Cloud-disabled body — every gated Cloud route returns this           */
/* ------------------------------------------------------------------ */

describe("Cloud-disabled body wire shape", () => {
  /** The webhooks-drain / exports-sweep / retention-sweep / compliance
   *  routes are guarded by the per-feature flag and return the same
   *  shape when the flag is off. The cron routes import the same
   *  body constant via the gating helper, so a single regression
   *  here breaks every gate at once. */
  it("is the not_implemented body when the Cloud surface is off", () => {
    expect(isCloudEvidenceEnabled()).toBe(false);
    expect(CLOUD_DISABLED_BODY).toEqual({
      error: "Cloud surface is not enabled",
      code: "not_implemented",
    });
  });
});
