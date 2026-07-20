import { describe, expect, it } from "vitest";
import {
  computeEnvelopeDigest,
  isLegacyEvidencePackage,
  legacyChainIdToSystem,
  migrateLegacyEvidence,
  sha256HexUtf8,
  validateEnvelope,
  type LegacyEvidencePackage,
} from "../src/index";

const legacy: LegacyEvidencePackage = {
  p: "fileonchain-evidence",
  v: 1,
  artifact: {
    cid: "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy",
    sha256: sha256HexUtf8("bytes"),
    byteLength: 5,
    metadata: { model: "claude-fable-5" },
  },
  signatures: [{ some: "legacy-signature-record" }],
  storage: [{ mode: "evidence-only" }],
  settlements: [{ chainId: "evm:11155111", txHash: "0xabc", blockNumber: 1 }],
  inclusion: { root: sha256HexUtf8("root"), leafIndex: 0, proof: [] },
  createdAt: "2026-07-11T12:00:00Z",
  sessionId: "s-1",
};

describe("legacy migration", () => {
  it("detects legacy packages", () => {
    expect(isLegacyEvidencePackage(legacy)).toBe(true);
    expect(isLegacyEvidencePackage({ protocol: "fileonchain-evidence", version: 1 })).toBe(false);
  });

  it("maps EVM chain ids to CAIP-2 and keeps other families", () => {
    expect(legacyChainIdToSystem("evm:11155111")).toBe("eip155:11155111");
    expect(legacyChainIdToSystem("substrate:autonomys-mainnet")).toBe(
      "substrate:autonomys-mainnet",
    );
  });

  it("produces a valid, finalized envelope with legacy receipts wrapped", () => {
    const envelope = migrateLegacyEvidence(legacy, { migratedAt: "2026-07-11T13:00:00Z" });
    expect(validateEnvelope(envelope)).toEqual([]);
    expect(envelope.envelope?.digest.sha256).toBe(computeEnvelopeDigest(envelope));
    expect(envelope.receipts.settlement[0].adapter).toBe("fileonchain-anchor-legacy/v1");
    expect(envelope.receipts.settlement[0].system).toBe("eip155:11155111");
    expect(envelope.receipts.inclusion[0].adapter).toBe("fileonchain-merkle/v1");
  });

  it("never presents legacy signatures as protocol artifact signatures", () => {
    const envelope = migrateLegacyEvidence(legacy, { migratedAt: "2026-07-11T13:00:00Z" });
    expect(envelope.signatures).toEqual([]);
    const legacyExt = envelope.extensions?.["org.fileonchain.legacy"] as {
      signatures: unknown[];
      migration: { from: string };
    };
    expect(legacyExt.signatures).toEqual(legacy.signatures);
    expect(legacyExt.migration.from).toBe("legacy-evidence-v1");
  });

  it("carries legacy metadata as namespaced claims, not subject fields", () => {
    const envelope = migrateLegacyEvidence(legacy, { migratedAt: "2026-07-11T13:00:00Z" });
    expect((envelope.subject as Record<string, unknown>).metadata).toBeUndefined();
    const claims = envelope.claims?.["org.fileonchain.legacy"] as Record<string, unknown>;
    expect(claims.metadata).toEqual({ model: "claude-fable-5" });
    expect(claims.sessionId).toBe("s-1");
  });
});
