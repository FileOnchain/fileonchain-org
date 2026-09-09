import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { verifyEvidenceJson } from "@fileonchain/verify";
import { parseEnvelope } from "@fileonchain/sdk/protocol";
import { settlementSystemName, summarizeReport } from "@/lib/verify/summary";

/**
 * The card summary is computed from the protocol conformance fixtures so
 * its counts stay tied to real envelopes. Artifact and envelope signer
 * counts are asserted separately — the whole point of the summary is
 * that they never merge.
 */

const fixturesDir = path.resolve(__dirname, "../../../packages/protocol/fixtures");
const load = (file: string) => readFileSync(path.join(fixturesDir, file), "utf8");

describe("summarizeReport", () => {
  it("counts receipts, systems and both signature kinds for the full fixture", async () => {
    const json = load("full-receipts-envelope-signed.json");
    const envelope = parseEnvelope(json);
    const report = await verifyEvidenceJson(json, { checkReceiptsOnline: false });
    const summary = summarizeReport(envelope, report);

    expect(summary.status).toBe(report.status);
    expect(summary.statusLabel).toBe("Valid with warnings");
    expect(summary.checks.total).toBe(report.checks.length);
    expect(
      summary.checks.pass +
        summary.checks.fail +
        summary.checks.warning +
        summary.checks.unknown +
        summary.checks.skipped,
    ).toBe(report.checks.length);

    expect(summary.artifactSigners).toBe(envelope!.signatures.length);
    expect(summary.envelopeSigners).toBe(envelope!.envelope!.signatures.length);
    expect(summary.artifactSigners).toBeGreaterThan(0);
    expect(summary.envelopeSigners).toBeGreaterThan(0);

    expect(summary.receipts.total).toBe(
      envelope!.receipts.storage.length +
        envelope!.receipts.settlement.length +
        envelope!.receipts.inclusion.length,
    );
    expect(summary.receipts.settlement).toBeGreaterThan(0);
    expect(summary.settlementSystems.length).toBeGreaterThan(0);
    expect(summary.subject.sha256).toBe(envelope!.subject.digests!.sha256);
  });

  it("reports zero signers and receipts for the hash-only fixture", async () => {
    const json = load("minimal-hash-only.json");
    const report = await verifyEvidenceJson(json, { checkReceiptsOnline: false });
    const summary = summarizeReport(parseEnvelope(json), report);
    expect(summary.artifactSigners).toBe(0);
    expect(summary.envelopeSigners).toBe(0);
    expect(summary.receipts.total).toBe(0);
    expect(summary.settlementSystems).toEqual([]);
  });

  it("survives a non-envelope input with a null envelope", async () => {
    const report = await verifyEvidenceJson("not json", {});
    const summary = summarizeReport(null, report);
    expect(summary.status).toBe("invalid");
    expect(summary.checks.fail).toBeGreaterThan(0);
    expect(summary.subject.sha256).toBeNull();
  });
});

describe("settlementSystemName", () => {
  it("maps CAIP-2 EVM ids to the registry name", () => {
    expect(settlementSystemName("eip155:1")).toBe("Ethereum");
  });
  it("maps registry chain ids directly", () => {
    expect(settlementSystemName("evm:8453")).toBe("Base");
  });
  it("keeps unknown systems visible as their raw id", () => {
    expect(settlementSystemName("eip155:999999")).toBe("eip155:999999");
    expect(settlementSystemName("mystery:1")).toBe("mystery:1");
  });
});
