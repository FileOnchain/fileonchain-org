import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MAX_ENVELOPE_BYTES,
  RemoteEnvelopeError,
  fetchRemoteEnvelope,
  isForbiddenHostname,
  isPublicAddress,
  resolveEnvelopeInput,
  verifyRemoteEnvelope,
} from "@/lib/server/remote-envelope";
import { encodeEnvelopeParam } from "@/lib/verify/samples";

/**
 * The badge and card routes fetch caller-supplied URLs from the server,
 * so the request-forgery fence is the part worth pinning: private and
 * loopback targets are refused at every redirect hop, bodies are capped,
 * and the input parser only ever yields an http(s) URL or inline JSON.
 *
 * Fetches use IP-literal hosts so no DNS lookup happens in tests.
 */

const fixturesDir = path.resolve(__dirname, "../../../packages/protocol/fixtures");
const fixture = readFileSync(path.join(fixturesDir, "full-receipts-envelope-signed.json"), "utf8");

const PUBLIC_HOST = "https://93.184.216.34/evidence.json";

const fakeFetch =
  (handler: (url: string) => Response): typeof fetch =>
  (input) =>
    Promise.resolve(handler(input instanceof Request ? input.url : String(input)));

const expectBadge = async (promise: Promise<unknown>, badge: "unknown" | "unreachable") => {
  await expect(promise).rejects.toBeInstanceOf(RemoteEnvelopeError);
  await promise.catch((err: RemoteEnvelopeError) => expect(err.badge).toBe(badge));
};

describe("public address fence", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12::1",
    "::ffff:10.0.0.1",
    "::ffff:127.0.0.1",
  ])("rejects %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:2800:220:1:248:1893:25c8:1946"])(
    "accepts %s",
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );

  it("rejects loopback names and local-only TLDs without DNS", () => {
    for (const host of ["localhost", "foo.localhost", "printer.local", "db.internal", "[::1]", "127.0.0.1"]) {
      expect(isForbiddenHostname(host)).toBe(true);
    }
    expect(isForbiddenHostname("example.com")).toBe(false);
  });
});

describe("resolveEnvelopeInput", () => {
  it("prefers url=, accepts envelope=<url>, decodes envelope=<base64url>", () => {
    expect(resolveEnvelopeInput(new URLSearchParams({ url: PUBLIC_HOST }))).toMatchObject({ kind: "url" });
    expect(resolveEnvelopeInput(new URLSearchParams({ envelope: PUBLIC_HOST }))).toMatchObject({ kind: "url" });
    const inline = resolveEnvelopeInput(new URLSearchParams({ envelope: encodeEnvelopeParam("{}") }));
    expect(inline).toEqual({ kind: "inline", json: "{}" });
  });

  it("refuses non-http schemes and garbage", () => {
    expect(() => resolveEnvelopeInput(new URLSearchParams({ url: "file:///etc/passwd" }))).toThrow(
      RemoteEnvelopeError,
    );
    expect(() => resolveEnvelopeInput(new URLSearchParams({ envelope: "%%%" }))).toThrow(RemoteEnvelopeError);
    expect(() => resolveEnvelopeInput(new URLSearchParams())).toThrow(RemoteEnvelopeError);
  });
});

describe("fetchRemoteEnvelope", () => {
  it("returns the body of a public URL", async () => {
    const text = await fetchRemoteEnvelope(new URL(PUBLIC_HOST), fakeFetch(() => new Response(fixture)));
    expect(text).toBe(fixture);
  });

  it("refuses private hosts before fetching", async () => {
    let called = false;
    const promise = fetchRemoteEnvelope(
      new URL("http://169.254.169.254/latest/meta-data"),
      fakeFetch(() => {
        called = true;
        return new Response("secret");
      }),
    );
    await expectBadge(promise, "unreachable");
    expect(called).toBe(false);
  });

  it("vets every redirect hop", async () => {
    const promise = fetchRemoteEnvelope(
      new URL(PUBLIC_HOST),
      fakeFetch((url) =>
        url === PUBLIC_HOST
          ? new Response(null, { status: 302, headers: { location: "http://127.0.0.1:8080/x" } })
          : new Response("secret"),
      ),
    );
    await expectBadge(promise, "unreachable");
  });

  it("follows a public redirect", async () => {
    const text = await fetchRemoteEnvelope(
      new URL(PUBLIC_HOST),
      fakeFetch((url) =>
        url === PUBLIC_HOST
          ? new Response(null, { status: 302, headers: { location: "https://8.8.8.8/e.json" } })
          : new Response(fixture),
      ),
    );
    expect(text).toBe(fixture);
  });

  it("caps the body size", async () => {
    const big = "x".repeat(MAX_ENVELOPE_BYTES + 1);
    await expectBadge(fetchRemoteEnvelope(new URL(PUBLIC_HOST), fakeFetch(() => new Response(big))), "unreachable");
  });

  it("maps HTTP errors to unreachable", async () => {
    await expectBadge(
      fetchRemoteEnvelope(new URL(PUBLIC_HOST), fakeFetch(() => new Response("", { status: 404 }))),
      "unreachable",
    );
  });
});

describe("verifyRemoteEnvelope", () => {
  it("verifies a fetched fixture offline and summarizes it", async () => {
    const result = await verifyRemoteEnvelope(
      new URLSearchParams({ url: PUBLIC_HOST }),
      fakeFetch(() => new Response(fixture)),
    );
    expect(result.input.kind).toBe("url");
    expect(result.report.status).toBe("valid-with-warnings");
    expect(result.summary.artifactSigners).toBeGreaterThan(0);
    expect(result.summary.envelopeSigners).toBeGreaterThan(0);
  });

  it("verifies an inline envelope without fetching", async () => {
    const result = await verifyRemoteEnvelope(
      new URLSearchParams({ envelope: encodeEnvelopeParam(fixture) }),
      fakeFetch(() => {
        throw new Error("must not fetch");
      }),
    );
    expect(result.input.kind).toBe("inline");
    expect(result.report.status).toBe("valid-with-warnings");
  });

  it("reports a non-envelope body as an invalid result, not an error", async () => {
    const result = await verifyRemoteEnvelope(
      new URLSearchParams({ url: PUBLIC_HOST }),
      fakeFetch(() => new Response("<html>nope</html>")),
    );
    expect(result.report.status).toBe("invalid");
    expect(result.envelope).toBeNull();
  });
});
