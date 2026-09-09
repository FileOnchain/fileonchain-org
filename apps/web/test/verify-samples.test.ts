import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { verifyEvidenceJson } from "@fileonchain/verify";
import {
  MAX_ENVELOPE_PARAM_LENGTH,
  SAMPLE_SUBJECT_CONTENT,
  VERIFY_SAMPLES,
  buildEnvelopeShareLink,
  decodeEnvelopeParam,
  encodeEnvelopeParam,
  parseRemoteEnvelopeUrl,
} from "@/lib/verify/samples";

/**
 * Pin the `/verify` samples to the protocol conformance fixtures.
 *
 * The samples in `public/samples/` are byte copies of
 * `packages/protocol/fixtures/*.json`. If a fixture is regenerated (an
 * intentional protocol change) this test fails until the copy is
 * refreshed, and if the verifier's result for a sample drifts from the
 * status its caption promises, the caption has to change with it. Both
 * keep the samples honest: they run through the same verifier as any
 * pasted envelope, with no special-cased happy path.
 */

const fixturesDir = path.resolve(__dirname, "../../../packages/protocol/fixtures");
const samplesDir = path.resolve(__dirname, "../public/samples");

const manifest = JSON.parse(readFileSync(path.join(fixturesDir, "manifest.json"), "utf8")) as {
  subjectContent: string;
  fixtures: { file: string; expectedStatus: string }[];
};

describe("verify samples", () => {
  it.each(VERIFY_SAMPLES.map((s) => [s.file, s] as const))(
    "%s is a byte copy of the protocol fixture",
    (file) => {
      const fixture = readFileSync(path.join(fixturesDir, file), "utf8");
      const sample = readFileSync(path.join(samplesDir, file), "utf8");
      expect(sample).toBe(fixture);
    },
  );

  it("describes the subject the fixture manifest describes", () => {
    expect(SAMPLE_SUBJECT_CONTENT).toBe(manifest.subjectContent);
  });

  it.each(VERIFY_SAMPLES.map((s) => [s.label, s] as const))(
    "%s verifies to the status its caption promises",
    async (_label, sample) => {
      const json = readFileSync(path.join(samplesDir, sample.file), "utf8");
      const expected = manifest.fixtures.find((f) => f.file === sample.file)?.expectedStatus;
      expect(expected).toBe(sample.expects);

      // Exactly what the page does: the envelope plus the sample's original
      // bytes, offline.
      const report = await verifyEvidenceJson(json, {
        subjectBytes: new TextEncoder().encode(SAMPLE_SUBJECT_CONTENT),
        checkReceiptsOnline: false,
      });
      expect(report.status).toBe(sample.expects);
      expect(report.checks.find((c) => c.name === "subject-sha256")?.status).toBe("pass");
    },
  );

  it("fits every sample into a ?envelope= share link", () => {
    for (const sample of VERIFY_SAMPLES) {
      const json = readFileSync(path.join(samplesDir, sample.file), "utf8");
      const link = buildEnvelopeShareLink(json, "https://fileonchain.org");
      expect(link).not.toBeNull();
      expect(link!.length).toBeLessThan(MAX_ENVELOPE_PARAM_LENGTH + 64);
    }
  });
});

describe("?envelope= encoding", () => {
  it("round-trips arbitrary UTF-8 JSON through base64url", () => {
    const json = '{"protocol":"fileonchain-evidence","name":"résumé — “quoted”","n":1}';
    const encoded = encodeEnvelopeParam(json);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeEnvelopeParam(encoded)).toBe(json);
  });

  it("accepts plain base64 with padding too", () => {
    const json = '{"a":1}';
    const encoded = encodeEnvelopeParam(json);
    const plain = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=";
    expect(decodeEnvelopeParam(plain)).toBe(json);
  });

  it("refuses to build a share link for an oversized envelope", () => {
    const big = JSON.stringify({ pad: "x".repeat(MAX_ENVELOPE_PARAM_LENGTH) });
    expect(buildEnvelopeShareLink(big, "https://fileonchain.org")).toBeNull();
  });
});

describe("?url= validation", () => {
  it("accepts http(s) URLs only", () => {
    expect(parseRemoteEnvelopeUrl("https://example.org/e.json")?.href).toBe(
      "https://example.org/e.json",
    );
    expect(parseRemoteEnvelopeUrl(" http://localhost:3000/samples/x.json ")).not.toBeNull();
    expect(parseRemoteEnvelopeUrl("javascript:alert(1)")).toBeNull();
    expect(parseRemoteEnvelopeUrl("file:///etc/passwd")).toBeNull();
    expect(parseRemoteEnvelopeUrl("not a url")).toBeNull();
  });
});
