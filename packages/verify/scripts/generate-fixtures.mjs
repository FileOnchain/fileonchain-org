/**
 * Generate the public conformance fixtures in packages/protocol/fixtures/.
 *
 * Deterministic on purpose: fixed test-only keys (anvil key #1 for EIP-191,
 * a constant ed25519 seed), fixed timestamps, canonical content. Re-running
 * must produce byte-identical fixtures — if it doesn't, the protocol
 * implementation changed and the change must be intentional.
 *
 * Run from packages/verify after building protocol + verify:
 *   node scripts/generate-fixtures.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ed25519 } from "@noble/curves/ed25519";
import { privateKeyToAccount } from "viem/accounts";
import * as protocol from "../../protocol/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../../protocol/fixtures");
mkdirSync(fixturesDir, { recursive: true });

// Test-only keys. Never funded, never reused outside fixtures.
const EVM_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ED_SEED = new Uint8Array(32).fill(7);
const evmAccount = privateKeyToAccount(EVM_KEY);
const edPub = protocol.bytesToHex(ed25519.getPublicKey(ED_SEED));
const CREATED_AT = "2026-07-11T12:00:00Z";

const textBytes = new TextEncoder().encode("agent run #42 output: all systems nominal");
const subject = {
  type: "artifact",
  digests: { sha256: protocol.sha256Hex(textBytes) },
  mediaType: "text/plain",
  size: textBytes.length,
  name: "run-42.txt",
};

const encoder = new TextEncoder();
const edSign = (payload) =>
  protocol.bytesToHex(ed25519.sign(encoder.encode(payload), ED_SEED));

const signArtifact = async (context, signer) => {
  const payload = protocol.artifactSigningPayload(context);
  const payloadDigest = protocol.sha256HexUtf8(payload);
  if (signer === "evm") {
    return {
      signer: { kind: "wallet", publicKey: evmAccount.address, scheme: "eip191" },
      payloadDigest,
      signature: await evmAccount.signMessage({ message: payload }),
      signedAt: CREATED_AT,
    };
  }
  return {
    signer: {
      kind: "agent",
      id: "agent://reporter-1",
      publicKey: edPub,
      scheme: "ed25519",
      onBehalfOf: { kind: "organization", id: "example.org" },
    },
    payloadDigest,
    signature: edSign(payload),
    signedAt: CREATED_AT,
  };
};

const agentClaims = {
  "org.fileonchain.agent": {
    runId: "run_42",
    agentId: "agent_reporter",
    sessionId: "session-42",
    status: "completed",
    model: { provider: "anthropic", id: "claude-fable-5" },
  },
};

const fixtures = [];
const save = (name, envelope, expectedStatus, description) => {
  writeFileSync(resolve(fixturesDir, `${name}.json`), JSON.stringify(envelope, null, 2) + "\n");
  fixtures.push({ file: `${name}.json`, expectedStatus, description });
};

// 1. Minimal hash-only evidence.
save(
  "minimal-hash-only",
  protocol.buildEnvelope({ subject, createdAt: CREATED_AT }),
  "valid-with-warnings",
  "Unsigned, receipt-free envelope: integrity + time only",
);

// 2. Signed artifact evidence (single EVM signer).
{
  const context = { subject };
  save(
    "signed-artifact",
    protocol.buildEnvelope({
      subject,
      createdAt: CREATED_AT,
      signatures: [await signArtifact(context, "evm")],
    }),
    "valid-with-warnings",
    "One EIP-191 artifact signature (key status unknown ⇒ warnings)",
  );
}

// 3. Multiple signers + delegated agent signature, agent profile.
{
  const context = {
    subject,
    claims: agentClaims,
    profile: "org.fileonchain.agent/v1",
  };
  save(
    "agent-profile-multi-signer",
    protocol.buildEnvelope({
      subject,
      profile: "org.fileonchain.agent/v1",
      claims: agentClaims,
      createdAt: CREATED_AT,
      signatures: [await signArtifact(context, "evm"), await signArtifact(context, "ed")],
    }),
    "valid-with-warnings",
    "Agent Evidence Profile, wallet + delegated agent signers",
  );
}

// 4. Receipts: external storage + EVM settlement + Merkle inclusion + envelope signature.
{
  const siblings = [protocol.sha256HexUtf8("sibling-a"), protocol.sha256HexUtf8("sibling-b")];
  const tree = protocol.buildMerkleTree([subject.digests.sha256, ...siblings]);
  const context = { subject };
  let envelope = protocol.buildEnvelope({
    subject,
    createdAt: CREATED_AT,
    signatures: [await signArtifact(context, "ed")],
    receipts: {
      storage: [
        {
          type: "storage",
          adapter: "fileonchain-storage/v1",
          payload: { mode: "external-storage", uri: "https://example.org/run-42.txt" },
        },
      ],
      settlement: [
        {
          type: "settlement",
          adapter: "fileonchain-evm-anchor/v1",
          system: "eip155:11155111",
          payload: {
            chainId: "evm:11155111",
            txHash: "0x" + "ab".repeat(32),
            blockNumber: 123456,
          },
        },
      ],
      inclusion: [
        {
          type: "inclusion",
          adapter: "fileonchain-merkle/v1",
          payload: { root: tree.root, leafIndex: 0, proof: tree.proofFor(0) },
        },
      ],
    },
  });
  const envPayload = protocol.envelopeSigningPayload(envelope.envelope.digest.sha256);
  envelope = protocol.addEnvelopeSignature(envelope, {
    signer: { kind: "organization", id: "example.org", publicKey: edPub, scheme: "ed25519" },
    payloadDigest: protocol.sha256HexUtf8(envPayload),
    signature: edSign(envPayload),
    signedAt: CREATED_AT,
  });
  save(
    "full-receipts-envelope-signed",
    envelope,
    "valid-with-warnings",
    "Storage + settlement + inclusion receipts, organization envelope signature",
  );

  // 5. Modified receipt: change a receipt after finalization → digest mismatch.
  const tampered = structuredClone(envelope);
  tampered.receipts.settlement[0].payload.blockNumber = 999999;
  save("tampered-receipt", tampered, "invalid", "Receipt modified after finalization — envelope digest mismatch");

  // 6. Removed receipt after finalization → digest mismatch.
  const removed = structuredClone(envelope);
  removed.receipts.settlement = [];
  save("removed-receipt", removed, "invalid", "Receipt removed after finalization — envelope digest mismatch");
}

// 7. Invalid subject digest (bytes won't match — verifier must be run with --artifact).
{
  const wrong = structuredClone(subject);
  wrong.digests = { sha256: protocol.sha256HexUtf8("not the real bytes") };
  save(
    "wrong-subject-digest",
    protocol.buildEnvelope({ subject: wrong, createdAt: CREATED_AT }),
    "valid-with-warnings",
    "Digest does not match run-42.txt bytes — invalid only when verified WITH the artifact",
  );
}

// 8. Invalid signature (bit-flipped).
{
  const context = { subject };
  const sig = await signArtifact(context, "ed");
  sig.signature = sig.signature.slice(0, -2) + (sig.signature.endsWith("00") ? "01" : "00");
  save(
    "invalid-signature",
    protocol.buildEnvelope({ subject, createdAt: CREATED_AT, signatures: [sig] }),
    "invalid",
    "ed25519 signature bit-flipped",
  );
}

// 9. Unknown profile.
save(
  "unknown-profile",
  protocol.buildEnvelope({
    subject,
    profile: "com.example.unknown/v9",
    claims: { "com.example.unknown": { anything: true } },
    createdAt: CREATED_AT,
  }),
  "valid-with-warnings",
  "Unregistered profile — claims preserved, reported unknown",
);

// 10. Unknown extension namespace (must be preserved, never failed).
save(
  "unknown-extension",
  protocol.buildEnvelope({
    subject,
    createdAt: CREATED_AT,
    extensions: { "com.example.custom": { note: "extension data the verifier does not understand" } },
  }),
  "valid-with-warnings",
  "Unknown extension namespace preserved",
);

// 11. Legacy package + 12. its migration.
{
  const legacy = {
    p: "fileonchain-evidence",
    v: 1,
    artifact: {
      cid: "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy",
      sha256: subject.digests.sha256,
      byteLength: textBytes.length,
      mediaType: "text/plain",
      name: "run-42.txt",
      metadata: { model: "claude-fable-5", runId: 42 },
    },
    signatures: [],
    storage: [{ mode: "evidence-only" }],
    settlements: [
      { chainId: "evm:11155111", txHash: "0x" + "ab".repeat(32), blockNumber: 123456 },
    ],
    createdAt: CREATED_AT,
    sessionId: "session-42",
  };
  save("legacy-evidence-v1", legacy, "valid-with-warnings", "Pre-separation package, verified via the legacy path");
  save(
    "legacy-migrated",
    protocol.migrateLegacyEvidence(legacy, { migratedAt: CREATED_AT }),
    "valid-with-warnings",
    "The same package after `fileonchain migrate`",
  );
}

writeFileSync(
  resolve(fixturesDir, "manifest.json"),
  JSON.stringify(
    {
      description:
        "FileOnChain Evidence Protocol conformance fixtures. `expectedStatus` is the verifier result WITHOUT subject bytes and WITHOUT online checks; wrong-subject-digest additionally becomes `invalid` when verified with fixtures' run-42 bytes.",
      subjectContent: "agent run #42 output: all systems nominal",
      fixtures,
    },
    null,
    2,
  ) + "\n",
);
console.log(`${fixtures.length} fixtures written to ${fixturesDir}`);
