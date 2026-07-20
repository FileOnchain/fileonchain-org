# @fileonchain/agent-profile

The **FileOnChain Agent Evidence Profile v1**
(`org.fileonchain.agent/v1`) — the first official application profile of
the [FileOnChain Evidence Protocol](../../docs/protocol/evidence-protocol.md).
Where the protocol is neutral, this profile is opinionated: it defines
how AI-agent runs, outputs, tool calls, approvals, and policies are
represented as `org.fileonchain.agent` claims, which claims are required
(`runId`, `agentId`), and how to validate them. Raw prompts and full
observability payloads are never required — the profile references and
hashes; it does not copy.

Profile documentation:
[docs/profiles/agent-evidence-v1.md](../../docs/profiles/agent-evidence-v1.md).

## Install

```bash
pnpm add @fileonchain/agent-profile   # brings @fileonchain/protocol
```

Importing the package registers the profile with the protocol's profile
registry, so verifiers that import it validate agent claims.

## Usage

```ts
import { buildAgentEvidence, validateAgentClaims } from "@fileonchain/agent-profile";
import { sha256Hex } from "@fileonchain/protocol";

const envelope = buildAgentEvidence({
  subject: {
    type: "artifact",
    digests: { sha256: sha256Hex(reportBytes) },
    name: "report.md",
    mediaType: "text/markdown",
  },
  run: {
    runId: "run_42",
    agentId: "agent_reporter",
    status: "completed",
    model: { provider: "anthropic", id: "claude-fable-5", promptDigest },
    toolCalls: [{ name: "web_search", inputDigest, outputDigest, status: "success" }],
    approvals: [{ approverId: "alice@example.org", type: "human-review" }],
  },
});
// profile stamped as "org.fileonchain.agent/v1", claims validated, envelope finalized

validateAgentClaims({ runId: "", agentId: "a" }); // => ["runId is required"]
```

For the full sealing flow (signers, receipts, envelope signatures) use
`sealAgentRun` from [`@fileonchain/sdk`](../sdk)'s `/evidence` subpath.
