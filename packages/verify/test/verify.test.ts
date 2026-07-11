import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import {
  artifactSigningPayload,
  buildEnvelope,
  bytesToHex,
  sha256Hex,
  sha256HexUtf8,
  type SubjectDescriptor,
} from "@fileonchain/protocol";
import { verifyEnvelope, verifyEvidenceJson } from "../src/index";

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../protocol/fixtures");
const manifest = JSON.parse(readFileSync(resolve(fixturesDir, "manifest.json"), "utf8")) as {
  subjectContent: string;
  fixtures: Array<{ file: string; expectedStatus: string; description: string }>;
};

describe("conformance fixtures", () => {
  for (const fixture of manifest.fixtures) {
    it(`${fixture.file} → ${fixture.expectedStatus} (${fixture.description})`, async () => {
      const raw = readFileSync(resolve(fixturesDir, fixture.file), "utf8");
      const report = await verifyEvidenceJson(raw);
      expect(report.status).toBe(fixture.expectedStatus);
    });
  }

  it("wrong-subject-digest becomes invalid when verified WITH the bytes", async () => {
    const raw = readFileSync(resolve(fixturesDir, "wrong-subject-digest.json"), "utf8");
    const bytes = new TextEncoder().encode(manifest.subjectContent);
    const report = await verifyEvidenceJson(raw, { subjectBytes: bytes });
    expect(report.status).toBe("invalid");
  });

  it("correct fixtures pass subject-integrity with the bytes", async () => {
    const raw = readFileSync(resolve(fixturesDir, "signed-artifact.json"), "utf8");
    const bytes = new TextEncoder().encode(manifest.subjectContent);
    const report = await verifyEvidenceJson(raw, { subjectBytes: bytes });
    expect(report.checks.find((c) => c.name === "subject-sha256")?.status).toBe("pass");
    expect(report.ok).toBe(true);
  });
});

describe("context binding", () => {
  const seed = new Uint8Array(32).fill(9);
  const publicKey = bytesToHex(ed25519.getPublicKey(seed));
  const encoder = new TextEncoder();
  const subject: SubjectDescriptor = {
    type: "artifact",
    digests: { sha256: sha256Hex(encoder.encode("payload-bytes")) },
  };

  const signFor = (context: Parameters<typeof artifactSigningPayload>[0]) => {
    const payload = artifactSigningPayload(context);
    return {
      signer: { kind: "agent" as const, publicKey, scheme: "ed25519" as const },
      payloadDigest: sha256HexUtf8(payload),
      signature: bytesToHex(ed25519.sign(encoder.encode(payload), seed)),
    };
  };

  it("rejects a signature replayed from another purpose", async () => {
    // Signed as an approval, presented as a plain artifact signature.
    const approvalSig = signFor({ subject, purpose: "approval" });
    const envelope = buildEnvelope({
      subject,
      signatures: [{ ...approvalSig, purpose: undefined }],
    });
    const report = await verifyEnvelope(envelope);
    expect(report.status).toBe("invalid");
    expect(report.checks.find((c) => c.name === "signature[0]")?.detail).toMatch(/context binding/);
  });

  it("accepts the same signature when the purpose travels with it", async () => {
    const approvalSig = { ...signFor({ subject, purpose: "approval" }), purpose: "approval" };
    const envelope = buildEnvelope({ subject, signatures: [approvalSig] });
    const report = await verifyEnvelope(envelope);
    expect(report.checks.find((c) => c.name === "signature[0]")?.status).toBe("pass");
  });

  it("rejects a signature replayed under a different profile", async () => {
    const bare = signFor({ subject });
    const envelope = buildEnvelope({
      subject,
      profile: "com.example.other/v1",
      claims: { "com.example.other": {} },
      signatures: [bare],
    });
    const report = await verifyEnvelope(envelope);
    expect(report.checks.find((c) => c.name === "signature[0]")?.status).toBe("fail");
  });

  it("separates artifact and envelope signature reporting", async () => {
    const raw = readFileSync(resolve(fixturesDir, "full-receipts-envelope-signed.json"), "utf8");
    const report = await verifyEvidenceJson(raw);
    const groups = new Set(report.checks.map((c) => c.group));
    expect(groups.has("artifact-signatures")).toBe(true);
    expect(groups.has("envelope-signatures")).toBe(true);
    expect(
      report.checks.find((c) => c.group === "envelope-signatures" && c.name === "envelope-signature[0]")
        ?.status,
    ).toBe("pass");
  });
});

describe("drafts and unknowns", () => {
  it("reports a draft (unfinalized) envelope as incomplete", async () => {
    const subject: SubjectDescriptor = {
      type: "artifact",
      digests: { sha256: sha256HexUtf8("draft") },
    };
    const draft = buildEnvelope({ subject, finalize: false });
    const report = await verifyEnvelope(draft);
    expect(report.status).toBe("incomplete");
  });

  it("reports unknown receipt adapters as unknown, not failed", async () => {
    const subject: SubjectDescriptor = {
      type: "artifact",
      digests: { sha256: sha256HexUtf8("x") },
    };
    const envelope = buildEnvelope({
      subject,
      receipts: {
        settlement: [
          {
            type: "settlement",
            adapter: "com-example-custom/v3",
            system: "eip155:1",
            payload: { anything: true },
          },
        ],
      },
    });
    const report = await verifyEnvelope(envelope);
    const check = report.checks.find((c) => c.name.includes("com-example-custom"));
    expect(check?.status).toBe("unknown");
    expect(report.ok).toBe(true);
  });
});
