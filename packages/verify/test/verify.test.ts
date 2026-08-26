import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  artifactSigningPayload,
  buildEnvelope,
  bytesToHex,
  finalizeEnvelope,
  sha256Hex,
  sha256HexUtf8,
  type EvidenceEnvelope,
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

describe("honest reporting", () => {
  it("marks unattested reports: attested=false without any verified signature", async () => {
    const raw = readFileSync(resolve(fixturesDir, "minimal-hash-only.json"), "utf8");
    const report = await verifyEvidenceJson(raw);
    expect(report.ok).toBe(true);
    expect(report.attested).toBe(false);
  });

  it("marks attested reports: attested=true once a signature verifies", async () => {
    const raw = readFileSync(resolve(fixturesDir, "signed-artifact.json"), "utf8");
    const report = await verifyEvidenceJson(raw);
    expect(report.attested).toBe(true);
  });

  it("never reports an unsigned envelope digest as tamper-evidence", async () => {
    // Attacker model: take an unsigned finalized envelope, tamper a
    // receipt AND recompute the digest. The digest matches again — the
    // report must not read as tamper-proof.
    const subject: SubjectDescriptor = {
      type: "artifact",
      digests: { sha256: sha256HexUtf8("tamper-me") },
    };
    const original = buildEnvelope({
      subject,
      receipts: {
        settlement: [
          {
            type: "settlement",
            adapter: "fileonchain-evm-anchor/v1",
            system: "eip155:11155111",
            payload: { chainId: "evm:11155111", txHash: "0x" + "ab".repeat(32), blockNumber: 1 },
          },
        ],
      },
    });
    const tampered = structuredClone(original) as EvidenceEnvelope;
    (tampered.receipts.settlement[0].payload as { blockNumber: number }).blockNumber = 999999;
    const recomputed = finalizeEnvelope(tampered);
    expect(recomputed.envelope?.digest.sha256).not.toBe(original.envelope?.digest.sha256);
    const report = await verifyEnvelope(recomputed);
    const digestCheck = report.checks.find((c) => c.name === "envelope-digest");
    expect(digestCheck?.status).toBe("warning");
    expect(digestCheck?.detail).toMatch(/unsigned/);
    expect(report.attested).toBe(false);
  });

  it("keeps the strong digest message only when an envelope signature verifies", async () => {
    const raw = readFileSync(resolve(fixturesDir, "full-receipts-envelope-signed.json"), "utf8");
    const report = await verifyEvidenceJson(raw);
    const digestCheck = report.checks.find((c) => c.name === "envelope-digest");
    expect(digestCheck?.status).toBe("pass");
    expect(digestCheck?.detail).toMatch(/envelope signature/);
  });

  it("reports offline settlement receipts as unknown, never pass", async () => {
    const raw = readFileSync(resolve(fixturesDir, "full-receipts-envelope-signed.json"), "utf8");
    const report = await verifyEvidenceJson(raw);
    const offline = report.checks.find((c) => c.name.startsWith("settlement[") && c.name.endsWith(":offline"));
    expect(offline?.status).toBe("unknown");
    expect(offline?.detail).toMatch(/on-chain binding not verified offline/);
  });

  it("downgrades inclusion proofs whose root no settlement receipt anchors", async () => {
    const subject: SubjectDescriptor = {
      type: "artifact",
      digests: { sha256: sha256HexUtf8("batched-subject") },
    };
    const { buildMerkleTree } = await import("@fileonchain/protocol");
    const tree = buildMerkleTree([subject.digests!.sha256!, sha256HexUtf8("sibling")]);
    const envelope = buildEnvelope({
      subject,
      receipts: {
        inclusion: [
          {
            type: "inclusion",
            adapter: "fileonchain-merkle/v1",
            payload: {
              root: tree.root,
              leafIndex: 0,
              leafCount: tree.leafCount,
              proof: tree.proofFor(0),
            },
          },
        ],
      },
    });
    const report = await verifyEnvelope(envelope);
    const inclusion = report.checks.find(
      (c) => c.name.includes("fileonchain-merkle") && c.name.endsWith(":offline"),
    );
    expect(inclusion?.status).toBe("unknown");
    expect(inclusion?.detail).toMatch(/not anchored by any settlement receipt/);
  });

  it("checks migrated legacy inclusion proofs under the legacy-scheme adapter", async () => {
    const { migrateLegacyEvidence } = await import("@fileonchain/protocol");
    const { buildMerkleTree: buildLegacyTree } = await import("@fileonchain/utils");
    const sha256 = sha256HexUtf8("legacy-batched");
    const tree = buildLegacyTree([sha256, sha256HexUtf8("legacy-sibling")]);
    const envelope = migrateLegacyEvidence(
      {
        p: "fileonchain-evidence",
        v: 1,
        artifact: { cid: "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy", sha256 },
        signatures: [],
        storage: [{ mode: "evidence-only" }],
        settlements: [],
        inclusion: { root: tree.root, leafIndex: 0, proof: tree.proofFor(0) },
        createdAt: "2026-07-11T12:00:00Z",
      },
      { migratedAt: "2026-07-11T13:00:00Z" },
    );
    expect(envelope.receipts.inclusion[0].adapter).toBe("fileonchain-merkle-legacy/v1");
    const report = await verifyEnvelope(envelope);
    const inclusion = report.checks.find(
      (c) => c.name.includes("fileonchain-merkle-legacy") && c.name.endsWith(":offline"),
    );
    // Proof verifies under the legacy scheme, then honestly downgrades:
    // no settlement receipt anchors the root.
    expect(inclusion?.status).toBe("unknown");
    expect(inclusion?.detail).toMatch(/not anchored by any settlement receipt/);
  });

  it("rejects lenient ed25519 encodings (uppercase / 0x-prefixed hex)", async () => {
    const seed = new Uint8Array(32).fill(4);
    const publicKey = bytesToHex(ed25519.getPublicKey(seed));
    const encoder = new TextEncoder();
    const subject: SubjectDescriptor = {
      type: "artifact",
      digests: { sha256: sha256Hex(encoder.encode("strict-hex")) },
    };
    const payload = artifactSigningPayload({ subject });
    const signature = bytesToHex(ed25519.sign(encoder.encode(payload), seed));
    const envelope = buildEnvelope({
      subject,
      signatures: [
        {
          signer: { kind: "agent", publicKey: publicKey.toUpperCase(), scheme: "ed25519" },
          payloadDigest: sha256HexUtf8(payload),
          signature,
        },
      ],
    });
    const report = await verifyEnvelope(envelope);
    const check = report.checks.find((c) => c.name === "signature[0]");
    expect(check?.status).toBe("fail");
    expect(check?.detail).toMatch(/lowercase hex/);
  });
});

describe("wire-form safety", () => {
  const envelopeRaw = () =>
    JSON.stringify(
      buildEnvelope({
        subject: { type: "artifact", digests: { sha256: sha256HexUtf8("wire-safety") } },
      }),
    );

  it("rejects duplicate top-level keys in the wire form", async () => {
    const raw = envelopeRaw().replace(
      '"protocol":"fileonchain-evidence"',
      '"protocol":"fileonchain-evidence","protocol":"fileonchain-evidence"',
    );
    const report = await verifyEvidenceJson(raw);
    expect(report.status).toBe("invalid");
    expect(report.checks[0].detail).toMatch(/duplicate key "protocol"/);
  });

  it("rejects __proto__ keys in the wire form", async () => {
    const raw = `{"__proto__":{"polluted":true},${envelopeRaw().slice(1)}`;
    const report = await verifyEvidenceJson(raw);
    expect(report.status).toBe("invalid");
    expect(report.checks[0].detail).toMatch(/__proto__/);
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
