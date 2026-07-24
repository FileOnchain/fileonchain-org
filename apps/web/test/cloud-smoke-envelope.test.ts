import { describe, expect, it } from "vitest";
import {
  buildCloudSmokeEnvelope,
  SMOKE_DEFAULT_SUBJECT_BYTES,
  SMOKE_SIGNER_IDENTITY,
  SMOKE_SIGNER_PUBLIC_KEY,
} from "@/lib/server/cloud-smoke-envelope";
import { canonicalStringify } from "@fileonchain/protocol";
import { verifyEnvelope } from "@fileonchain/verify";

/**
 * Pin the Cloud smoke envelope helper. The helper is the single source
 * of truth for the envelope the ops smoke posts to `/api/v1/evidence`:
 * if any of these checks regress, the smoke either:
 *   1. stops being byte-deterministic (so the round-trip cannot be
 *      asserted by sha256), or
 *   2. stops being verifiable by the open reference verifier
 *      (`@fileonchain/verify`) — the same code that the
 *      `/api/v1/verify` server route runs.
 *
 * Pure unit test, no DB, no fetch. Runs under `pnpm --filter
 * @fileonchain/web test`.
 */

describe("SMOKE_SIGNER_PUBLIC_KEY / SMOKE_SIGNER_IDENTITY", () => {
  it("exports the ed25519 public key derived from the fixed seed", () => {
    // 32 bytes hex-encoded = 64 chars, lowercase.
    expect(SMOKE_SIGNER_PUBLIC_KEY).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the identity's public key matches the exported constant", () => {
    expect(SMOKE_SIGNER_IDENTITY.publicKey).toBe(SMOKE_SIGNER_PUBLIC_KEY);
  });

  it("the identity names a smoke-only agent + org that must never appear in production", () => {
    expect(SMOKE_SIGNER_IDENTITY.id).toBe("agent://fileonchain-smoke");
    expect(SMOKE_SIGNER_IDENTITY.onBehalfOf?.id).toBe("smoke.example.org");
  });
});

describe("buildCloudSmokeEnvelope — happy path", () => {
  it("produces a sealed, envelope-signed Agent Evidence Profile envelope", async () => {
    const envelope = await buildCloudSmokeEnvelope();
    // Finalized: the envelope-digest member is present.
    expect(envelope.envelope).toBeDefined();
    expect(envelope.envelope?.digest.sha256).toMatch(/^[0-9a-f]{64}$/);
    // One artifact signature, one envelope signature.
    expect(envelope.signatures).toHaveLength(1);
    expect(envelope.envelope?.signatures).toHaveLength(1);
    // Agent profile is wired.
    expect(envelope.profile).toBe("org.fileonchain.agent/v1");
  });

  it("the artifact signature and envelope signature share the same signer identity", async () => {
    const envelope = await buildCloudSmokeEnvelope();
    expect(envelope.signatures[0]?.signer.publicKey).toBe(
      SMOKE_SIGNER_PUBLIC_KEY,
    );
    expect(envelope.envelope?.signatures[0]?.signer.publicKey).toBe(
      SMOKE_SIGNER_PUBLIC_KEY,
    );
  });

  it("byte-stable: calling the helper twice produces the same envelope digest", async () => {
    const a = await buildCloudSmokeEnvelope();
    const b = await buildCloudSmokeEnvelope();
    expect(a.envelope?.digest.sha256).toBe(b.envelope?.digest.sha256);
  });
});

describe("verifyEnvelope — the smoke's envelope is accepted by the open verifier", () => {
  it("returns valid-with-warnings (the storage mode + identity-binding unknowns are honest)", async () => {
    const envelope = await buildCloudSmokeEnvelope();
    const report = await verifyEnvelope(envelope, {
      subjectBytes: SMOKE_DEFAULT_SUBJECT_BYTES,
    });
    // No fail checks. Warnings/unknowns are the honest reflection of
    // smoke-only setup: no key-status URL, on-behalf-of with no
    // authorization statement, evidence-only storage mode.
    expect(report.status).not.toBe("invalid");
    expect(report.status).not.toBe("incomplete");
    expect(["valid", "valid-with-warnings"]).toContain(report.status);
  });

  it("the subject sha256 check passes when subject bytes are provided", async () => {
    const envelope = await buildCloudSmokeEnvelope();
    const report = await verifyEnvelope(envelope, {
      subjectBytes: SMOKE_DEFAULT_SUBJECT_BYTES,
    });
    const check = report.checks.find((c) => c.name === "subject-sha256");
    expect(check?.status).toBe("pass");
  });

  it("the artifact signature verifies against the smoke signer's public key", async () => {
    const envelope = await buildCloudSmokeEnvelope();
    const report = await verifyEnvelope(envelope, {
      subjectBytes: SMOKE_DEFAULT_SUBJECT_BYTES,
    });
    const sig = report.checks.find((c) => c.name === "signature[0]");
    expect(sig?.status).toBe("pass");
  });

  it("the envelope signature verifies against the smoke signer's public key", async () => {
    const envelope = await buildCloudSmokeEnvelope();
    const report = await verifyEnvelope(envelope, {
      subjectBytes: SMOKE_DEFAULT_SUBJECT_BYTES,
    });
    const envSig = report.checks.find((c) => c.name === "envelope-signature[0]");
    expect(envSig?.status).toBe("pass");
  });

  it("the envelope-digest check passes (finalization is self-consistent)", async () => {
    const envelope = await buildCloudSmokeEnvelope();
    const report = await verifyEnvelope(envelope, {
      subjectBytes: SMOKE_DEFAULT_SUBJECT_BYTES,
    });
    const digestCheck = report.checks.find((c) => c.name === "envelope-digest");
    expect(digestCheck?.status).toBe("pass");
  });

  it("the evidence-only storage receipt is accepted (pass, not unknown)", async () => {
    const envelope = await buildCloudSmokeEnvelope();
    const report = await verifyEnvelope(envelope, {
      subjectBytes: SMOKE_DEFAULT_SUBJECT_BYTES,
    });
    const storage = report.checks.find(
      (c) => c.name === "storage[0]:fileonchain-storage/v1:offline",
    );
    expect(storage?.status).toBe("pass");
  });
});

describe("verifyEnvelope — the smoke's envelope is rejected when tampered", () => {
  it("catches receipt tampering via the envelope-digest", async () => {
    const envelope = await buildCloudSmokeEnvelope();
    // Mutate the storage receipt's mode — the envelope digest no longer
    // matches, so the verifier must report invalid.
    const tampered = structuredClone(envelope);
    (tampered.receipts.storage[0]!.payload as { mode: string }).mode =
      "external-storage";
    const report = await verifyEnvelope(tampered, {
      subjectBytes: SMOKE_DEFAULT_SUBJECT_BYTES,
    });
    expect(report.status).toBe("invalid");
    const digestCheck = report.checks.find((c) => c.name === "envelope-digest");
    expect(digestCheck?.status).toBe("fail");
  });

  it("catches subject-byte tampering via the subject-sha256 check", async () => {
    const envelope = await buildCloudSmokeEnvelope();
    const wrongBytes = new TextEncoder().encode("not the smoke subject");
    const report = await verifyEnvelope(envelope, {
      subjectBytes: wrongBytes,
    });
    const subjectCheck = report.checks.find((c) => c.name === "subject-sha256");
    expect(subjectCheck?.status).toBe("fail");
  });
});

describe("canonicalStringify — the smoke's envelope is canonical-JSON round-trip stable", () => {
  it("canonicalStringify(envelope) round-trips through JSON.parse (idempotent)", async () => {
    const envelope = await buildCloudSmokeEnvelope();
    const canonical = canonicalStringify(envelope);
    // Re-parse, re-canonicalize — the second canonical form must match.
    const reparsed = JSON.parse(canonical) as typeof envelope;
    const again = canonicalStringify(reparsed);
    expect(again).toBe(canonical);
  });
});
