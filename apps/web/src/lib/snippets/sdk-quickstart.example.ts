/**
 * The SDK snippet shown in the homepage's developer quickstart block.
 *
 * This file is real TypeScript: `next build` type-checks it against the
 * current `@fileonchain/sdk/evidence` surface, so the snippet on the
 * homepage cannot drift from the SDK without failing the build. It is
 * never imported by application code; `lib/snippets/quickstart.ts` reads
 * it from disk at render time and displays everything below the marker.
 *
 * Keep the displayed part short (the block sits above the fold) and keep
 * the inputs it needs declared above the marker.
 */
import type { EvidenceSigner } from "@fileonchain/sdk/evidence";

/** An EIP-191 wallet or an ed25519 agent key; see docs/protocol. */
declare const agentSigner: EvidenceSigner;

// ---- snippet:start ----
import { readFile, writeFile } from "node:fs/promises";
import { sealAgentRun } from "@fileonchain/sdk/evidence";

// Hash-only by default: the bytes are digested here and never leave your machine.
const envelope = await sealAgentRun({
  subjectBytes: await readFile("report.md"), // the agent's output artifact
  run: { runId: "run_01J9X4T7", agentId: "agent://acme/analyst", status: "completed" },
  signers: [agentSigner], // an EIP-191 wallet or an ed25519 agent key
});

// One portable evidence envelope. Anchor it, then hand it to anyone to verify.
await writeFile("evidence.json", JSON.stringify(envelope, null, 2));
