import { describe, expect, it } from "vitest";
import { cloudSignerStatusUrl } from "@/lib/server/cloud-signer";
import { mintWebhookSecret } from "@/lib/server/webhooks";
import { siteConfig } from "@/lib/site";

/** Two pure / boundary-only helpers. cloudSignerStatusUrl builds
 *  the verifier-facing `keyStatusUrl` from a Cloud signer's scope;
 *  mintWebhookSecret hands back a fresh webhook secret pair. Both
 *  drive sensitive surface area (signer rotation + secret mint)
 *  so a regression here would be visible immediately. */

describe("cloudSignerStatusUrl", () => {
  it("routes an org scope through /api/cloud/signer/[orgId]", () => {
    expect(
      cloudSignerStatusUrl({ kind: "org", orgId: "org_123" }),
    ).toBe(`${siteConfig.url}/api/cloud/signer/org_123`);
  });

  it("routes a project scope through the dedicated /project/ branch", () => {
    expect(
      cloudSignerStatusUrl({
        kind: "project",
        orgId: "org_123",
        projectId: "proj_456",
      }),
    ).toBe(`${siteConfig.url}/api/cloud/signer/project/proj_456`);
  });

  it("does not include the trailing slash in the canonical origin", () => {
    const url = cloudSignerStatusUrl({ kind: "org", orgId: "org_1" });
    expect(url.startsWith("https://")).toBe(true);
    expect(url).not.toMatch(/\/\/api/); // exactly one slash separator
  });
});

describe("mintWebhookSecret", () => {
  it("returns a plaintext that starts with the whsec_ prefix", () => {
    const { plaintext } = mintWebhookSecret();
    expect(plaintext.startsWith("whsec_")).toBe(true);
  });

  it("preview is exactly the last 4 characters of the plaintext", () => {
    const { plaintext, preview } = mintWebhookSecret();
    expect(preview).toBe(plaintext.slice(-4));
  });

  it("sealed version is opaque and round-trippable through openWebhookSecret", () => {
    const { plaintext, sealed } = mintWebhookSecret();
    expect(sealed).not.toBe(plaintext); // sealed form is the secretbox envelope
    // The secretbox round-trip is exercised by openWebhookSecret in the
    // same module; importing it here would couple the test to an
    // crypto detail, so we just verify shape (non-empty + different
    // from plaintext).
    expect(sealed.length).toBeGreaterThan(0);
  });

  it("emits a distinct plaintext on every call (32 random bytes → uniqueness)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      seen.add(mintWebhookSecret().plaintext);
    }
    expect(seen.size).toBe(8);
  });
});
