import { describe, expect, it } from "vitest";
import type { VerificationReport } from "@fileonchain/verify";
import {
  CHECK_TAG,
  STAMP_LABEL,
  buildVerifyCommand,
  checksForReceiptLine,
  digestBars,
  footerLines,
  receiptCheckPhase,
  receiptFileName,
} from "@/lib/verify/receipt";

const report: VerificationReport = {
  status: "valid-with-warnings",
  ok: true,
  attested: true,
  checks: [
    { name: "schema", group: "schema", status: "pass", detail: "" },
    { name: "settlement[1]:fileonchain-evm-anchor/v1:offline", group: "settlement-receipts", status: "unknown", detail: "" },
    { name: "settlement[1]:fileonchain-evm-anchor/v1:online", group: "settlement-receipts", status: "skipped", detail: "" },
    { name: "settlement[10]:fileonchain-evm-anchor/v1:offline", group: "settlement-receipts", status: "pass", detail: "" },
    { name: "inclusion[2]:acme/v1", group: "inclusion-receipts", status: "unknown", detail: "" },
  ],
  summary: {
    format: "envelope",
    protocol: "fileonchain-evidence",
    version: 1,
    profile: "com.example.custom/v1",
    profileKnown: false,
    subject: { type: "artifact", name: "Q3 report (final).md", sha256: "ab".repeat(32) },
    envelopeDigest: "19d6b2c2",
    artifactSignatures: 1,
    envelopeSignatures: 2,
    receipts: [
      { name: "settlement[1]:fileonchain-evm-anchor/v1", type: "settlement", adapter: "fileonchain-evm-anchor/v1", adapterKnown: true, system: "eip155:11155111", txHash: "0xab" },
      { name: "inclusion[2]:acme/v1", type: "inclusion", adapter: "acme/v1", adapterKnown: false },
    ],
    inputs: { subjectBytes: true, online: false },
  },
};

describe("receipt wording", () => {
  it("stamps the verifier's exact status and never says verified", () => {
    for (const label of Object.values(STAMP_LABEL)) {
      expect(label.toLowerCase()).not.toContain("verified");
    }
    expect(STAMP_LABEL["valid-with-warnings"]).toBe("VALID · WARNINGS");
    expect(CHECK_TAG.unknown).toBe("UNKNOWN");
    expect(CHECK_TAG.unknown).not.toBe(CHECK_TAG.fail);
  });

  it("keeps artifact and envelope signature counts on separate footer lines", () => {
    const lines = footerLines(report.summary!);
    const labels = lines.map((l) => l.label);
    expect(labels).toContain("artifact signatures");
    expect(labels).toContain("envelope signatures");
    expect(lines.find((l) => l.label === "artifact signatures")?.value).toBe("1");
    expect(lines.find((l) => l.label === "envelope signatures")?.value).toBe("2");
  });

  it("prints an unregistered profile as unknown, and a missing digest as a draft", () => {
    expect(footerLines(report.summary!).find((l) => l.label === "profile")?.value).toBe(
      "com.example.custom/v1 (UNKNOWN to this verifier)",
    );
    const draft = footerLines({ ...report.summary!, envelopeDigest: undefined, profile: undefined });
    expect(draft.find((l) => l.label === "envelope digest")?.value).toBe("none (draft)");
    expect(draft.find((l) => l.label === "profile")?.value).toBe("none");
  });
});

describe("reproducing command", () => {
  it("mirrors the report's inputs", () => {
    expect(buildVerifyCommand({ subjectBytes: false, online: false })).toBe(
      "fileonchain verify evidence.json",
    );
    expect(buildVerifyCommand({ subjectBytes: true, online: true }, "run.json", "run-42.txt")).toBe(
      "fileonchain verify run.json --artifact run-42.txt --online",
    );
    expect(buildVerifyCommand({ subjectBytes: true, online: false })).toBe(
      "fileonchain verify evidence.json --artifact <subject-bytes>",
    );
  });
});

describe("receipt line items", () => {
  it("pairs a line with exactly its own checks (no prefix bleed between indices)", () => {
    const line = report.summary!.receipts[0]!;
    const checks = checksForReceiptLine(report, line);
    expect(checks.map((c) => c.name)).toEqual([
      "settlement[1]:fileonchain-evm-anchor/v1:offline",
      "settlement[1]:fileonchain-evm-anchor/v1:online",
    ]);
    expect(checks.map((c) => receiptCheckPhase(line, c))).toEqual(["offline", "online"]);
  });

  it("pairs an unknown-adapter line with its bare check", () => {
    const line = report.summary!.receipts[1]!;
    const checks = checksForReceiptLine(report, line);
    expect(checks).toHaveLength(1);
    expect(checks[0]?.status).toBe("unknown");
    expect(receiptCheckPhase(line, checks[0]!)).toBe(line.name);
  });
});

describe("download name and barcode", () => {
  it("derives a safe file name from the subject and the status", () => {
    expect(receiptFileName(report)).toBe("Q3-report-final.md.receipt.valid-with-warnings.png");
    expect(receiptFileName({ ...report, summary: undefined })).toBe(
      "evidence.receipt.valid-with-warnings.png",
    );
  });

  it("builds bars from a digest and nothing from no digest", () => {
    expect(digestBars(undefined)).toEqual([]);
    expect(digestBars("zz")).toEqual([]);
    const bars = digestBars("0f", 4);
    expect(bars).toEqual([1, 4, 1, 4]);
    expect(digestBars("ab".repeat(32))).toHaveLength(32);
  });
});
