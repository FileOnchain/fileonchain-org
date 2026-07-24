import { describe, expect, it } from "vitest";
import {
  BYOK_PROVIDERS,
  getByokProvider,
  isByokProvider,
} from "@/lib/byok/providers";

/** The BYOK provider registry is the routing table the upload
 *  advisor + the anchor worker read to decide whether a user's
 *  provider key can bypass FileOnChain credits. A wrong entry
 *  either sends a chain to a provider that doesn't actually cover
 *  it (upload fails on the other side) or hides a working provider
 *  (silent overcharge). */

describe("BYOK_PROVIDERS", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(BYOK_PROVIDERS)).toBe(true);
    expect(BYOK_PROVIDERS.length).toBeGreaterThan(0);
  });

  it("every entry carries the four required metadata fields", () => {
    for (const provider of BYOK_PROVIDERS) {
      expect(typeof provider.id).toBe("string");
      expect(provider.id.length).toBeGreaterThan(0);
      expect(typeof provider.name).toBe("string");
      expect(provider.name.length).toBeGreaterThan(0);
      expect(typeof provider.description).toBe("string");
      expect(provider.description.length).toBeGreaterThan(0);
      expect(typeof provider.keyFormatHint).toBe("string");
      expect(typeof provider.docsUrl).toBe("string");
      expect(provider.docsUrl.startsWith("http")).toBe(true);
    }
  });

  it("every entry's chainIds is a non-empty array of valid chain ids", () => {
    for (const provider of BYOK_PROVIDERS) {
      expect(Array.isArray(provider.chainIds)).toBe(true);
      expect(provider.chainIds.length).toBeGreaterThan(0);
      for (const chainId of provider.chainIds) {
        expect(chainId).toMatch(/^[a-z_-]+:[a-z0-9-]+$/);
      }
    }
  });

  it("every provider id is unique (no two providers share routing)", () => {
    const ids = BYOK_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getByokProvider", () => {
  it("returns the matching provider for a known id", () => {
    const provider = getByokProvider("autonomys-auto-drive");
    expect(provider).toBeDefined();
    expect(provider?.id).toBe("autonomys-auto-drive");
    expect(provider?.name).toBe("Autonomys Auto Drive");
  });

  it("returns undefined for an unknown id", () => {
    expect(getByokProvider("not-a-real-provider")).toBeUndefined();
    expect(getByokProvider("")).toBeUndefined();
  });

  it("every provider in BYOK_PROVIDERS is reachable via getByokProvider", () => {
    for (const provider of BYOK_PROVIDERS) {
      const resolved = getByokProvider(provider.id);
      expect(resolved).toBeDefined();
      expect(resolved?.id).toBe(provider.id);
    }
  });
});

describe("isByokProvider", () => {
  it("returns true for every provider id in BYOK_PROVIDERS", () => {
    for (const provider of BYOK_PROVIDERS) {
      expect(isByokProvider(provider.id)).toBe(true);
    }
  });

  it("returns false for unknown ids", () => {
    expect(isByokProvider("not-a-real-provider")).toBe(false);
    expect(isByokProvider("")).toBe(false);
  });

  it("returns false for non-string inputs", () => {
    expect(isByokProvider(null)).toBe(false);
    expect(isByokProvider(undefined)).toBe(false);
    expect(isByokProvider(42)).toBe(false);
    expect(isByokProvider({})).toBe(false);
    expect(isByokProvider([])).toBe(false);
  });
});
