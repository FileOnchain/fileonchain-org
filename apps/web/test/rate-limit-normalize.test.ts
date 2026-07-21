import { describe, expect, it } from "vitest";
import { endpointKey, clientIp } from "@/lib/server/rate-limit";

/** The rate-limit normalizers are pure functions of the incoming
 *  Request — they bucket traffic into per-(scope, endpoint) groups,
 *  and a mistake here is invisible to users but silently lets a
 *  noisy caller burn through an unthrottled bucket. */

/** Build a minimal Request-shaped object that viem/fetch-level
 *  helpers will accept. The constructor argument order is (input,
 *  init); we use the Request class directly so the tests don't
 *  depend on next/server internals. */
const req = (
  method: string,
  url: string,
  headers: Record<string, string> = {},
): Request => new Request(url, { method, headers });

describe("endpointKey", () => {
  it("returns 'METHOD /path' for a vanilla route", () => {
    expect(endpointKey(req("POST", "https://api.example.com/api/v1/anchor"))).toBe(
      "POST /api/v1/anchor",
    );
  });

  it("collapses bare 8+ hex path params to [id]", () => {
    // The regex accepts bare hex of 8+ characters (UUID shards etc.)
    expect(
      endpointKey(
        req("GET", "https://api.example.com/api/v1/anchor/abcdef1234567890"),
      ),
    ).toBe("GET /api/v1/anchor/[id]");
  });

  it("collapses long token-shaped path params to [id]", () => {
    // 20+ char base64url/hex tokens (envelope ids, delivery ids)
    expect(
      endpointKey(
        req(
          "POST",
          "https://api.example.com/api/v1/webhooks/wh_abcdefghijklmnopqrstuvwx/rotate_secret",
        ),
      ),
    ).toBe(
      "POST /api/v1/webhooks/[id]/rotate_secret",
    );
  });

  it("leaves short or non-id-shaped segments alone", () => {
    expect(
      endpointKey(req("GET", "https://api.example.com/api/cloud/signer/short")),
    ).toBe("GET /api/cloud/signer/short");
  });

  it("collapses 0x-prefixed EVM hashes via the long-token branch", () => {
    // EVM tx hashes start with `0x` then 64 hex chars (66 total).
    // The bare-hex alt doesn't match (the `x` falls outside [0-9a-f]),
    // but the 20+ char base64url/hex alt accepts them — the comma
    // in the comment on the regex omits 0x-prefixed values, which
    // was worth pinning.
    expect(
      endpointKey(
        req(
          "GET",
          "https://api.example.com/api/v1/anchor/0xabc123def4567890123456789012345678901234567890123456789012345",
        ),
      ),
    ).toBe("GET /api/v1/anchor/[id]");
  });

  it("buckets the same id-shaped path under the same key — no dodges via varied ids", () => {
    const a = endpointKey(
      req("GET", "https://api.example.com/api/v1/anchor/deadbeefcafe5678"),
    );
    const b = endpointKey(
      req("GET", "https://api.example.com/api/v1/anchor/01234567890abcdef"),
    );
    expect(a).toBe(b);
  });

  it("includes the HTTP method in the key so GET/POST/PUT aren't conflated", () => {
    expect(
      endpointKey(req("GET", "https://api.example.com/api/v1/anchor")),
    ).toBe("GET /api/v1/anchor");
    expect(
      endpointKey(req("POST", "https://api.example.com/api/v1/anchor")),
    ).toBe("POST /api/v1/anchor");
  });
});

describe("clientIp", () => {
  it("extracts the first IP from a comma-separated x-forwarded-for", () => {
    expect(
      clientIp(
        req(
          "GET",
          "https://api.example.com/api/v1/evidence",
          { "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" },
        ),
      ),
    ).toBe("203.0.113.5");
  });

  it("trims whitespace around the first hop", () => {
    expect(
      clientIp(
        req(
          "GET",
          "https://api.example.com/api/v1/evidence",
          { "x-forwarded-for": "  203.0.113.5  ,10.0.0.1" },
        ),
      ),
    ).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    expect(
      clientIp(
        req(
          "GET",
          "https://api.example.com/api/v1/evidence",
          { "x-real-ip": "203.0.113.42" },
        ),
      ),
    ).toBe("203.0.113.42");
  });

  it("falls back to 'unknown' so the bucket still keys per anonymous request", () => {
    expect(
      clientIp(req("GET", "https://api.example.com/api/v1/evidence")),
    ).toBe("unknown");
  });
});
