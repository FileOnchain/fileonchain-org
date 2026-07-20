# Agent Evidence Profile v1

**Profile identifier:** `org.fileonchain.agent/v1`
**Claim namespace:** `org.fileonchain.agent`
**Status:** Normative for the profile; builds on the
[FileOnChain Evidence Protocol Specification](../protocol/evidence-protocol.md)
**Reference implementation:** [`packages/agent-profile`](../../packages/agent-profile) (`@fileonchain/agent-profile`)

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be
interpreted as described in RFC 2119.

---

## 1. Target use case

Where the FileOnChain Evidence Protocol is neutral, this profile is
opinionated: it defines how **AI-agent runs** — their outputs, tool
calls, approvals, and policies — are represented as evidence envelopes,
so that a relying party can later answer:

> What did this agent produce, in which run, under which model and
> policy, with which tool calls, approved by whom — and has any of it
> changed?

The profile targets developers building AI agents and automated
workflows: agent-generated reports, code-generation outputs, tool-call
logs, deployment artifacts, automated approval records. Everything
domain-specific lives in the `org.fileonchain.agent` claims namespace;
the envelope, signatures, digests, and receipts are plain protocol
machinery, so any conforming verifier can check the evidence even if it
has never heard of this profile (it will report the profile as
*unknown* and still verify integrity, signatures, and receipts).

Setting `profile: "org.fileonchain.agent/v1"` on an envelope binds the
profile id into every artifact signature's signing payload — a
signature made under this profile cannot be replayed into another
profile's context.

## 2. Required claims

The `claims["org.fileonchain.agent"]` object **MUST** be present and
**MUST** carry:

| Claim | Type | Meaning |
| --- | --- | --- |
| `runId` | string, non-empty | The run this evidence belongs to. |
| `agentId` | string, non-empty | The agent that produced it. |

Everything else in the namespace is OPTIONAL. A verifier with the
profile registered fails validation when either required claim is
missing.

## 3. Optional run claims

| Claim | Type | Meaning |
| --- | --- | --- |
| `sessionId` | string | Session grouping several runs. |
| `parentRunId` | string | Parent run, for nested / spawned runs. |
| `organizationId` | string | Operating organization. |
| `environment` | string | Execution environment — e.g. `"production"`, `"staging"`, a hostname. |
| `startedAt` / `completedAt` | ISO 8601 | Run boundaries (asserted; receipts prove time). |
| `status` | `"completed"` \| `"failed"` \| `"cancelled"` \| `"running"` | Run outcome. |

## 4. Model metadata (`model`)

When present, `model` describes how the output was produced — by
identifiers and digests, never by content:

| Field | Presence | Meaning |
| --- | --- | --- |
| `id` | REQUIRED (when `model` is present) | Model identifier, e.g. `"claude-fable-5"`. |
| `provider` | OPTIONAL | e.g. `"anthropic"`. |
| `version` | OPTIONAL | Provider model version. |
| `configDigest` | OPTIONAL | SHA-256 (64 lowercase hex) of the canonical model configuration. |
| `promptDigest` | OPTIONAL | SHA-256 (64 lowercase hex) of the prompt / instruction content. |
| `templateId` | OPTIONAL | Prompt-template identifier, when templates are versioned separately. |

**Raw prompts MUST NOT be required** by any producer or consumer of
this profile. A prompt digest commits to the prompt without disclosing
it; the party holding the prompt can prove it matches later.

## 5. Tool-call evidence (`toolCalls`)

Each entry records one tool invocation, by reference and digest:

| Field | Presence | Meaning |
| --- | --- | --- |
| `name` | REQUIRED | Tool name. |
| `version` | OPTIONAL | Tool version. |
| `inputDigest` / `outputDigest` | OPTIONAL | SHA-256 (64 lowercase hex) of the tool input / output. |
| `at` | OPTIONAL | Execution timestamp (ISO 8601, asserted). |
| `status` | OPTIONAL | `"success"` or `"failure"`. |
| `traceRef` | OPTIONAL | External trace reference (an OpenTelemetry span, a Langfuse trace, …). |

Producers **SHOULD** record digests rather than payloads: the claims
are covered by artifact signatures, so a digest is a binding commitment
to the exact input/output without copying it into the envelope.

## 6. Output artifact evidence

The envelope's **subject** is the agent output itself — typically
`type: "artifact"` with the output's SHA-256 digest, size, media type,
and name (see §5 of the protocol spec). For a run that produced many
artifacts, seal a run **manifest** (`type: "manifest"`) and give each
artifact its own envelope with a `fileonchain-merkle/v1` inclusion
receipt, so one settlement transaction covers the whole run.

Artifact signatures over the subject-plus-claims answer *who signed
this output and its run claims*: the agent's own key (`kind: "agent"`,
usually ed25519), the operator's wallet (`kind: "wallet"`, EIP-191), or
both. An agent key MAY sign `onBehalfOf` an organization; without a
verifiable authorization statement, verifiers report that delegation as
claimed, not proven.

## 7. Approval evidence (`approvals`)

Each entry records a human or policy-gate approval within the run:

| Field | Presence | Meaning |
| --- | --- | --- |
| `approverId` | REQUIRED | Approver identity (human id, service id). |
| `type` | REQUIRED | Approval type — e.g. `"human-review"`, `"policy-gate"`, `"sign-off"`. |
| `at` | OPTIONAL | Approval time (ISO 8601, asserted). |
| `subjectDigest` | OPTIONAL | SHA-256 of exactly what was approved. |
| `policyId` | OPTIONAL | Policy the approval was made under. |
| `signatureIndex` | OPTIONAL | Index into the envelope's artifact signatures when the approval is backed by a cryptographic signature with purpose `"approval"`. |

When an approval is cryptographically backed, the approver signs the
artifact signing payload with `purpose: "approval"` and the approval
claim points at that signature via `signatureIndex`. The purpose is
bound into the signing payload, so an ordinary artifact signature
cannot be re-labeled as an approval (and vice versa). An approval claim
without a `signatureIndex` is an assertion by whoever signed the
envelope's claims, not an independently signed approval.

## 8. Policy metadata (`policy`)

| Field | Presence | Meaning |
| --- | --- | --- |
| `id` | REQUIRED (when `policy` is present) | Policy identifier. |
| `version` | OPTIONAL | Policy version. |
| `digest` | OPTIONAL | SHA-256 of the policy document. |
| `result` | OPTIONAL | Enforcement outcome — e.g. `"passed"`, `"failed"`, `"overridden"`. |
| `uri` | OPTIONAL | Where the policy document lives. |

## 9. Trace interoperability (`traceRefs`)

Agent stacks already emit rich traces. This profile **references and
hashes** them; it MUST NOT be used to copy full observability payloads
into envelopes by default. Each entry:

| Field | Presence | Meaning |
| --- | --- | --- |
| `system` | REQUIRED | Trace system — e.g. `"opentelemetry"`, `"langfuse"`, `"langsmith"`, `"openai-agents"`, `"mcp"`. |
| `uri` | OPTIONAL | Locator of the trace in that system. |
| `digest` | OPTIONAL | SHA-256 of the exported trace document, when a snapshot was captured. |

This gives the envelope a tamper-evident pointer into OpenTelemetry
spans, Langfuse or LangSmith traces, OpenAI Agents traces, or MCP event
logs, without coupling the evidence to any observability vendor or
copying potentially sensitive trace content.

## 10. Privacy recommendations

- **Hash-only is the default posture.** Prefer digests over content
  everywhere the schema offers both: prompt digests over prompts,
  input/output digests over payloads, trace digests over trace
  exports. An envelope with zero storage receipts is fully valid.
- Raw prompts, tool payloads, and trace bodies **SHOULD NOT** be
  embedded in claims. They are covered by digests; the holder can
  disclose and prove them selectively later.
- When bytes must be stored, choose the storage receipt mode
  deliberately (`evidence-only` / on-chain / external) and remember
  that on-chain storage is permanent — encrypt first when in doubt.
- `signedAt`, `startedAt`, `completedAt`, and `at` are asserted;
  settlement receipts are what prove time.

## 11. Example envelope

The conformance fixture
[`packages/protocol/fixtures/agent-profile-multi-signer.json`](../../packages/protocol/fixtures/agent-profile-multi-signer.json)
— an agent output signed by the operator's wallet (EIP-191) and by the
agent's own ed25519 key acting on behalf of an organization:

```json
{
  "protocol": "fileonchain-evidence",
  "version": 1,
  "profile": "org.fileonchain.agent/v1",
  "subject": {
    "type": "artifact",
    "digests": {
      "sha256": "cf3315e196480491a6eb663f80effcca46536d8c9a9a181ff49d900a4253e3de"
    },
    "mediaType": "text/plain",
    "size": 41,
    "name": "run-42.txt"
  },
  "claims": {
    "org.fileonchain.agent": {
      "runId": "run_42",
      "agentId": "agent_reporter",
      "sessionId": "session-42",
      "status": "completed",
      "model": {
        "provider": "anthropic",
        "id": "claude-fable-5"
      }
    }
  },
  "signatures": [
    {
      "signer": {
        "kind": "wallet",
        "publicKey": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "scheme": "eip191"
      },
      "payloadDigest": "ffaf253123d84a1aa4a5aecbb9189d1e7b5a49ce8fdeddf44945556691c3710a",
      "signature": "0xbe6a9018b3f1b2fa95ee2179eccc7941221f64b4de43f756b58a296d9651379d2ec221490434bdff428b763b4c33d0b3aefcaf601556e09780e28d8be62b5c8d1b",
      "signedAt": "2026-07-11T12:00:00Z"
    },
    {
      "signer": {
        "kind": "agent",
        "id": "agent://reporter-1",
        "publicKey": "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c",
        "scheme": "ed25519",
        "onBehalfOf": {
          "kind": "organization",
          "id": "example.org"
        }
      },
      "payloadDigest": "ffaf253123d84a1aa4a5aecbb9189d1e7b5a49ce8fdeddf44945556691c3710a",
      "signature": "d28a2bc19338e5d2fa09886692907dd9decab397d4f7b16f404189d163611d224f491104c2443fab4bc2cecaea8b2a57ee5ab1bc1c74fd73b681f8d373a5840e",
      "signedAt": "2026-07-11T12:00:00Z"
    }
  ],
  "receipts": {
    "storage": [],
    "settlement": [],
    "inclusion": []
  },
  "createdAt": "2026-07-11T12:00:00Z",
  "envelope": {
    "digest": {
      "sha256": "348b3b3c35ef69a01979ec540ce91939de2d0ebd15a35684afbc996843fe83cf"
    },
    "signatures": []
  }
}
```

The reference verifier reports this fixture `valid-with-warnings`
(without subject bytes): both signatures verify; the warnings are the
skipped byte check, the unproven identity/delegation bindings, and the
undeclared key status — honesty, not defects.

## 12. Integration guidance

- **Seal per run** — one envelope per agent run whose subject is the
  run's primary output — **or seal a per-session manifest**: a
  `manifest`-subject envelope over the session's artifacts, one
  settlement of the Merkle root, and a `fileonchain-merkle/v1`
  inclusion receipt in each artifact's envelope. For chatty agents,
  the session manifest is the recommended default: one settlement
  transaction, per-artifact proofs.
- **Use the reference SDK.** `@fileonchain/sdk/evidence` exposes
  `sealAgentRun`, which derives the subject from bytes, stamps the
  profile, validates the required claims, collects artifact
  signatures from your signers, and finalizes:

  ```ts
  import { sealAgentRun } from "@fileonchain/sdk/evidence";

  const envelope = await sealAgentRun({
    subjectBytes: reportBytes,
    subjectMeta: { name: "report.md", mediaType: "text/markdown" },
    run: {
      runId: "run_42",
      agentId: "agent_reporter",
      status: "completed",
      model: { provider: "anthropic", id: "claude-fable-5" },
      toolCalls: [{ name: "web_search", inputDigest, outputDigest }],
    },
    signers: [agentSigner], // ed25519 or EIP-191 EvidenceSigner
  });
  ```

  Attach receipts as they arrive (`settlementReceiptFromAnchor`,
  `storageReceipt`), re-finalize, and optionally `signEnvelope` to add
  the assembler's envelope signature.
- **Validation without sealing:** `validateAgentClaims(run)` and the
  registered `agentEvidenceProfile` (imported for its side effect by
  `@fileonchain/verify`) give you the same checks the verifier runs.
