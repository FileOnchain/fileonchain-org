import { describe, expect, it } from "vitest";
import { formatCostUsd } from "@/lib/mock/costs";
import { serializeByokKey } from "@/lib/server/byok";

/** Two small pure helpers that ride along with the anchor service.
 *  `formatCostUsd` is the four-tier price formatter the upload advisor
 *  + the recommendation headlines both use. The breaks (sub-cent → 4
 *  decimals, sub-dollar → 3, sub-$100 → 2, ≥ $100 → whole) are a
 *  user-facing contract — a regression hides the cost row.
 *  `serializeByokKey` is the JSON shape for a BYOK key row; the
 *  rule is: never expose the encrypted key material. */

/* ------------------------------------------------------------------ */
/* formatCostUsd                                                        */
/* ------------------------------------------------------------------ */

describe("formatCostUsd", () => {
  it("uses 4 decimals for sub-cent amounts", () => {
    // 0.0001 USD is the cheapest testnet cost — the formatter must
    // not collapse it to "$0.00" or the user sees the upload as free.
    expect(formatCostUsd(0.0001)).toBe("$0.0001");
    expect(formatCostUsd(0.0009)).toBe("$0.0009");
    expect(formatCostUsd(0.0099)).toBe("$0.0099");
  });

  it("uses 3 decimals for sub-dollar amounts", () => {
    expect(formatCostUsd(0.01)).toBe("$0.010");
    expect(formatCostUsd(0.013)).toBe("$0.013");
    expect(formatCostUsd(0.999)).toBe("$0.999");
  });

  it("uses 2 decimals for amounts between $1 and $99.99", () => {
    expect(formatCostUsd(1)).toBe("$1.00");
    expect(formatCostUsd(12.5)).toBe("$12.50");
    expect(formatCostUsd(99.99)).toBe("$99.99");
  });

  it("uses whole-dollar rounding for amounts >= $100", () => {
    expect(formatCostUsd(100)).toBe("$100");
    expect(formatCostUsd(1234.567)).toBe("$1,235");
    expect(formatCostUsd(9999)).toBe("$9,999");
  });

  it("uses the locale thousands separator at the top end", () => {
    // Vercel + Node render 1234567 as "1,234,567" under en-US.
    expect(formatCostUsd(1_234_567)).toBe("$1,234,567");
  });

  it("handles exactly the boundary at $0.01", () => {
    // The boundary test — the value is exactly the floor between
    // the 4-decimal and 3-decimal branches.
    expect(formatCostUsd(0.01)).toBe("$0.010");
  });

  it("handles exactly the boundary at $1", () => {
    expect(formatCostUsd(1)).toBe("$1.00");
  });

  it("handles exactly the boundary at $100", () => {
    expect(formatCostUsd(100)).toBe("$100");
  });

  it("formats zero as a sub-cent amount", () => {
    // 0 < 0.01 → 4-decimal branch.
    expect(formatCostUsd(0)).toBe("$0.0000");
  });
});

/* ------------------------------------------------------------------ */
/* serializeByokKey — JSON shape contract                               */
/* ------------------------------------------------------------------ */

describe("serializeByokKey", () => {
  /** Build a minimal byokKeys row. The serializer only reads a
   *  handful of fields; the rest are defaulted. */
  const key = (overrides: Record<string, unknown> = {}): never =>
    ({
      id: "byok_1",
      userId: "user_1",
      provider: "autonomys-auto-drive",
      label: "My Auto Drive key",
      encryptedKey: "00".repeat(64), // 32 bytes — must never leak
      keyPreview: "abcd1234",
      status: "valid",
      lastValidatedAt: new Date("2026-07-04T15:30:00Z"),
      revokedAt: null,
      createdAt: new Date("2026-07-01T10:00:00Z"),
      ...overrides,
    }) as never;

  it("emits the documented JSON shape", () => {
    const out = serializeByokKey(key());
    expect(out).toEqual({
      id: "byok_1",
      provider: "autonomys-auto-drive",
      label: "My Auto Drive key",
      keyPreview: "abcd1234",
      status: "valid",
      lastValidatedAt: "2026-07-04T15:30:00.000Z",
      revokedAt: null,
      createdAt: "2026-07-01T10:00:00.000Z",
    });
  });

  it("never includes the encrypted key material", () => {
    // The rule is hard: a BYOK key carries an encrypted secret
    // that the layer above must not export. The serializer is
    // THE boundary — a leaked field here would surface the
    // encrypted form on every API response.
    const out = serializeByokKey(key());
    expect(out).not.toHaveProperty("encryptedKey");
    expect(out).not.toHaveProperty("userId");
  });

  it("emits null for a non-existent lastValidatedAt", () => {
    const out = serializeByokKey(key({ lastValidatedAt: null }));
    expect(out.lastValidatedAt).toBeNull();
    expect(out.lastValidatedAt).not.toBe("null");
  });

  it("emits null for a revokedAt timestamp when the key is active", () => {
    const out = serializeByokKey(key({ revokedAt: null }));
    expect(out.revokedAt).toBeNull();
  });

  it("ISO-formats revokedAt when the key was revoked", () => {
    const out = serializeByokKey(
      key({ revokedAt: new Date("2026-07-10T20:00:00Z") }),
    );
    expect(out.revokedAt).toBe("2026-07-10T20:00:00.000Z");
  });

  it("preserves the 'invalid' status (a status that disables the key)", () => {
    // The owning route checks key.status === "invalid" to refuse
    // the upload — the status must survive the JSON round-trip.
    const out = serializeByokKey(key({ status: "invalid" }));
    expect(out.status).toBe("invalid");
  });
});
