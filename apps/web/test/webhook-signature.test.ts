import { describe, expect, it } from "vitest";
import {
  signWebhookPayload,
  verifyWebhookSignature,
  verifyWebhookHeader,
} from "@/lib/server/webhooks";

/** Pure helpers exercised in isolation. The signing scheme is
 *  Stripe-style `t=<unix>.<body>` with HMAC-SHA-256; the verify path
 *  rejects stale timestamps outside a 5-minute replay window. */

const SECRET = "whsec_test_super_secret_string";
const BODY = JSON.stringify({ id: "evt_123", type: "evidence.sealed", data: { ok: true } });

describe("signWebhookPayload + verifyWebhookSignature", () => {
  it("produces a deterministic hex HMAC for a fixed (secret, ts, body)", () => {
    const signature = signWebhookPayload(SECRET, 1_700_000_000, BODY);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    // Re-signing the same triple gives the same bytes — idempotent.
    expect(signWebhookPayload(SECRET, 1_700_000_000, BODY)).toBe(signature);
  });

  it("rejects a tampered body on re-verification", () => {
    const signature = signWebhookPayload(SECRET, 1_700_000_000, BODY);
    expect(verifyWebhookSignature(SECRET, 1_700_000_000, BODY, signature)).toBe(true);
    expect(
      verifyWebhookSignature(
        SECRET,
        1_700_000_000,
        JSON.stringify({ id: "evt_123", type: "evidence.sealed", data: { ok: false } }),
        signature,
      ),
    ).toBe(false);
  });

  it("rejects when the secret is wrong", () => {
    const signature = signWebhookPayload(SECRET, 1_700_000_000, BODY);
    expect(verifyWebhookSignature(SECRET, 1_700_000_000, BODY, signature)).toBe(true);
    expect(verifyWebhookSignature("whsec_other", 1_700_000_000, BODY, signature)).toBe(
      false,
    );
  });

  it("a signature of the wrong length fails closed without throwing", () => {
    expect(verifyWebhookSignature(SECRET, 1_700_000_000, BODY, "abc")).toBe(false);
    expect(verifyWebhookSignature(SECRET, 1_700_000_000, BODY, "")).toBe(false);
  });
});

describe("verifyWebhookHeader", () => {
  it("accepts a fresh, syntactically valid header", () => {
    const ts = 1_700_000_000;
    const sig = signWebhookPayload(SECRET, ts, BODY);
    // Round-trip directly through the `t=<ts>,v1=<sig>` shape that
    // `formatSignatureHeader` would build internally.
    const header = `t=${ts},v1=${sig}`;
    expect(verifyWebhookHeader(SECRET, header, BODY, ts)).toBe(true);
  });

  it("rejects a header signed for a timestamp outside the 5-minute replay window", () => {
    const now = 1_700_000_000;
    const stale = now - 6 * 60; // 6 minutes in the past
    const sig = signWebhookPayload(SECRET, stale, BODY);
    const header = `t=${stale},v1=${sig}`;
    expect(verifyWebhookHeader(SECRET, header, BODY, now)).toBe(false);
  });

  it("rejects malformed headers instead of throwing", () => {
    expect(verifyWebhookHeader(SECRET, "no-equ", BODY, 1_700_000_000)).toBe(false);
    expect(verifyWebhookHeader(SECRET, "t=abc,v1=00", BODY, 1_700_000_000)).toBe(false);
    expect(verifyWebhookHeader(SECRET, "v1=ff", BODY, 1_700_000_000)).toBe(false);
  });
});
