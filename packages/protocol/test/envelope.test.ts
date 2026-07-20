import { describe, expect, it } from "vitest";
import {
  addEnvelopeSignature,
  artifactSigningPayload,
  buildEnvelope,
  buildMerkleTree,
  computeEnvelopeDigest,
  envelopeSigningPayloadDigest,
  finalizeEnvelope,
  sha256HexUtf8,
  validateEnvelope,
  verifyMerkleInclusion,
  type EvidenceEnvelope,
  type SubjectDescriptor,
} from "../src/index";

const subject: SubjectDescriptor = {
  type: "artifact",
  digests: { sha256: sha256HexUtf8("hello world") },
  name: "hello.txt",
};

const settlementReceipt = {
  type: "settlement" as const,
  adapter: "fileonchain-evm-anchor/v1",
  system: "eip155:11155111",
  payload: { txHash: "0x" + "ab".repeat(32) },
};

describe("envelope digest", () => {
  it("is deterministic and excludes the envelope block", () => {
    const envelope = buildEnvelope({ subject, createdAt: "2026-07-11T12:00:00Z" });
    expect(envelope.envelope?.digest.sha256).toBe(computeEnvelopeDigest(envelope));
    // Recomputing on the finalized envelope must not recurse into `envelope`.
    expect(computeEnvelopeDigest(envelope)).toBe(
      computeEnvelopeDigest({ ...envelope, envelope: undefined } as EvidenceEnvelope),
    );
  });

  it("changes when a receipt is added, removed, or reordered", () => {
    const base = buildEnvelope({
      subject,
      createdAt: "2026-07-11T12:00:00Z",
      receipts: {
        settlement: [
          settlementReceipt,
          { ...settlementReceipt, payload: { txHash: "0x" + "cd".repeat(32) } },
        ],
      },
    });
    const digest = base.envelope!.digest.sha256;

    const removed = { ...base, receipts: { ...base.receipts, settlement: [settlementReceipt] } };
    expect(computeEnvelopeDigest(removed)).not.toBe(digest);

    const reordered = {
      ...base,
      receipts: { ...base.receipts, settlement: [...base.receipts.settlement].reverse() },
    };
    expect(computeEnvelopeDigest(reordered)).not.toBe(digest);

    const added = {
      ...base,
      receipts: {
        ...base.receipts,
        settlement: [
          ...base.receipts.settlement,
          { ...settlementReceipt, payload: { txHash: "0x" + "ee".repeat(32) } },
        ],
      },
    };
    expect(computeEnvelopeDigest(added)).not.toBe(digest);
  });

  it("drops stale envelope signatures on re-finalization", () => {
    let envelope = buildEnvelope({ subject, createdAt: "2026-07-11T12:00:00Z" });
    envelope = addEnvelopeSignature(envelope, {
      signer: { kind: "organization", publicKey: "aa".repeat(32), scheme: "ed25519" },
      payloadDigest: envelopeSigningPayloadDigest(envelope.envelope!.digest.sha256),
      signature: "00".repeat(64),
    });
    expect(envelope.envelope!.signatures).toHaveLength(1);

    // Mutate content, re-finalize: the signature attests a different digest.
    const changed = finalizeEnvelope({ ...envelope, id: "changed" });
    expect(changed.envelope!.signatures).toHaveLength(0);
  });
});

describe("artifact signing payload binding", () => {
  it("binds purpose, profile, and scope", () => {
    const base = artifactSigningPayload({ subject });
    expect(artifactSigningPayload({ subject, purpose: "approval" })).not.toBe(base);
    expect(artifactSigningPayload({ subject, profile: "org.fileonchain.agent/v1" })).not.toBe(base);
    expect(artifactSigningPayload({ subject, scope: { organization: "acme" } })).not.toBe(base);
  });

  it("binds claims content", () => {
    const withClaims = artifactSigningPayload({
      subject,
      claims: { "org.example.x": { a: 1 } },
    });
    const withOtherClaims = artifactSigningPayload({
      subject,
      claims: { "org.example.x": { a: 2 } },
    });
    expect(withClaims).not.toBe(withOtherClaims);
  });
});

describe("validateEnvelope", () => {
  it("accepts unknown claims and extensions (preserve, don't reject)", () => {
    const envelope = buildEnvelope({
      subject,
      claims: { "com.example.unknown": { any: "thing" } },
      extensions: { "com.example.ext": { more: true } },
    });
    expect(validateEnvelope(envelope)).toEqual([]);
  });

  it("requires a digest or uri on the subject", () => {
    expect(validateEnvelope({ protocol: "fileonchain-evidence", version: 1, subject: { type: "abstract" }, signatures: [], receipts: { storage: [], settlement: [], inclusion: [] } })).toContain(
      "subject needs at least one digest or a uri",
    );
  });

  it("rejects non-namespaced claim keys and malformed adapters", () => {
    const errors = validateEnvelope({
      protocol: "fileonchain-evidence",
      version: 1,
      subject,
      claims: { notNamespaced: {} },
      signatures: [],
      receipts: {
        storage: [{ type: "storage", adapter: "NoVersion", payload: {} }],
        settlement: [],
        inclusion: [],
      },
    });
    expect(errors.some((e) => e.includes("notNamespaced"))).toBe(true);
    expect(errors.some((e) => e.includes("adapter"))).toBe(true);
  });
});

describe("merkle", () => {
  it("proves inclusion for every leaf and rejects wrong indices", () => {
    const leaves = Array.from({ length: 5 }, (_, i) => sha256HexUtf8(`leaf-${i}`));
    const tree = buildMerkleTree(leaves);
    leaves.forEach((leaf, i) => {
      expect(verifyMerkleInclusion(leaf, i, tree.proofFor(i), tree.root)).toBe(true);
    });
    expect(verifyMerkleInclusion(leaves[0], 1, tree.proofFor(1), tree.root)).toBe(false);
  });
});
