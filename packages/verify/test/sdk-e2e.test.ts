import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@fileonchain/protocol";
import {
  sealAgentRun,
  signEnvelope,
  settlementReceiptFromAnchor,
  storageReceipt,
  type EvidenceSigner,
} from "@fileonchain/sdk/evidence";
import { verifyEnvelope } from "../src/index";

/**
 * End-to-end guard for the reference-SDK happy path: seal an agent run
 * with the high-level API, envelope-sign it, and confirm the independent
 * verifier accepts it — and catches tampering.
 */

const seed = new Uint8Array(32).fill(3);
const encoder = new TextEncoder();
const agentSigner: EvidenceSigner = {
  signer: {
    kind: "agent",
    id: "agent://ci-bot",
    publicKey: bytesToHex(ed25519.getPublicKey(seed)),
    scheme: "ed25519",
    onBehalfOf: { kind: "organization", id: "example.org" },
  },
  sign: (payload) => bytesToHex(ed25519.sign(encoder.encode(payload), seed)),
};

describe("sealAgentRun → signEnvelope → verifyEnvelope", () => {
  const output = encoder.encode("deploy plan: approved, 3 services");

  const seal = async () => {
    const envelope = await sealAgentRun({
      subjectBytes: output,
      subjectMeta: { name: "deploy-plan.txt", mediaType: "text/plain" },
      run: {
        runId: "run_777",
        agentId: "agent_ci",
        sessionId: "sess_9",
        status: "completed",
        model: { provider: "anthropic", id: "claude-fable-5" },
        toolCalls: [{ name: "deploy_preview", status: "success" }],
      },
      signers: [agentSigner],
      receipts: {
        storage: [storageReceipt({ mode: "evidence-only" })],
        settlement: [
          settlementReceiptFromAnchor({ chainId: "solana:mainnet", txHash: "5x".repeat(20) }),
        ],
      },
      createdAt: "2026-07-11T15:00:00Z",
    });
    return signEnvelope(envelope, [agentSigner]);
  };

  it("produces an envelope the independent verifier accepts", async () => {
    const envelope = await seal();
    const report = await verifyEnvelope(envelope, { subjectBytes: output });
    expect(report.status).toBe("valid-with-warnings"); // key status is honestly unknown
    expect(report.checks.find((c) => c.name === "subject-sha256")?.status).toBe("pass");
    expect(report.checks.find((c) => c.name === "profile")?.status).toBe("pass");
    expect(report.checks.find((c) => c.name === "signature[0]")?.status).toBe("pass");
    expect(report.checks.find((c) => c.name === "envelope-signature[0]")?.status).toBe("pass");
  });

  it("catches receipt tampering via the envelope digest", async () => {
    const envelope = await seal();
    const tampered = structuredClone(envelope);
    (tampered.receipts.settlement[0].payload as { txHash: string }).txHash = "different";
    const report = await verifyEnvelope(tampered, { subjectBytes: output });
    expect(report.status).toBe("invalid");
    expect(report.checks.find((c) => c.name === "envelope-digest")?.status).toBe("fail");
  });
});
