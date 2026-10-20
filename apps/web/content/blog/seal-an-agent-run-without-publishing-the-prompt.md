---
title: Seal an agent run without publishing the prompt
description: The Agent Evidence Profile commits a run by digest: the output, the model, the tool calls, and the prompt. The prompt itself stays with you.
date: 2026-10-15
author: Marc-Aurèle Besner
tags: agent-evidence, protocol
---

An agent run produces an output, and usually a trail around it: the instructions, the model, the tool calls, an approval, a trace sitting in some other system. Copying that trail into a document you hand to someone else is a disclosure decision. The [Agent Evidence Profile](/agent-evidence) is built so the default path is a commitment, and the bytes stay where the run left them.

The profile identifier is `org.fileonchain.agent/v1`. It is the first official application profile of the [Evidence Protocol](/protocol). The protocol stays neutral about what a subject is. The profile is opinionated about one kind of subject: the output of an AI-agent run, and the claims that describe that run. Those claims live under the namespace `org.fileonchain.agent`. A verifier that has never registered the profile still checks the envelope, and reports the profile as unknown. [What an evidence envelope proves](/blog/what-an-evidence-envelope-proves) covers that rule, and what a local check is allowed to mean. This post is about what goes into the claims, and what stays out.

![A card labeled Prompt, captioned Stays with you, with a SHA-256 arrow into an evidence envelope listing a run id, a prompt digest, and an output digest.](/blog/images/seal-an-agent-run-prompt-stays.jpg)

## What the profile records

Two claims are required.

- **runId.** The run this evidence belongs to. A non-empty string.
- **agentId.** The agent that produced it. A non-empty string.

`sealAgentRun` refuses to build an envelope when either one is missing. A verifier with the profile registered fails the same check. Everything else in the namespace is optional: a session id, a parent run, an organization, an environment such as `production` or a hostname, `startedAt` and `completedAt`, and a status of `completed`, `failed`, `cancelled`, or `running`.

Times written on the claims are asserted by whoever produced the envelope. A settlement receipt is a different kind of time. It records that a settlement system accepted a payload naming a digest. The two should stay distinct in any description of the run.

The subject of the envelope is the output. For a single artifact that is a SHA-256 digest, plus any of a media type, a size, and a display name. The digest is what a verifier recomputes when the bytes are in hand. The name is a label.

A run that produced many artifacts can be sealed as a manifest. Each artifact then carries its own envelope, with a `fileonchain-merkle/v1` inclusion receipt under the same Merkle root. One settlement of that root covers the run. For a chatty agent, a session manifest is the shape the profile recommends: one settlement transaction, and a membership proof on each artifact.

## Digests, where the schema offers them

Hash-only evidence is valid. An envelope whose `storage` array is empty is a complete document: the subject digest, the signatures, and any settlement receipts, with the output bytes left in the producer's custody. That is the default, because moving bytes — onto a storage system, to an external provider, or into FileOnChain Cloud — turns a tamper-evident record into a disclosure, and on-chain storage makes the disclosure permanent.

The same posture applies inside the claims. Where the schema offers a digest, record the digest.

- **Prompt.** `model.promptDigest` is the SHA-256 of the prompt or the instruction content, as 64 lowercase hex characters. The profile requires no raw prompt, from the code that seals the run or from anyone reading the envelope. `model.id` is required only when a `model` object is present. A provider, a version, a `configDigest` of the model configuration, and a `templateId` can sit beside it.
- **Tool calls.** Each entry needs a `name`. `inputDigest` and `outputDigest` commit to the exact input and the exact output. The payloads stay out of the envelope. An optional `status` is `success` or `failure`. An optional `traceRef` points at a span or a trace elsewhere.
- **Policy.** When a `policy` object is present, `id` is required. `policy.digest` commits to the policy document. `policy.result` records an outcome such as `passed`, `failed`, or `overridden`. The result is an assertion by the signer. The digest is what a later reader can recompute from the document.
- **Traces.** `traceRefs` name a system — `opentelemetry`, `langfuse`, `langsmith`, `openai-agents`, `mcp` — and may carry a URI and a digest of an exported snapshot. The profile points at traces and leaves the payloads in the system that produced them.

![Three rows labeled Prompt, Tool input, and Trace, each reduced to a SHA-256 digest, captioned The bytes stay. The digest travels.](/blog/images/seal-an-agent-run-three-digests.jpg)

Selective disclosure follows from the digest. The party who holds the prompt can publish it later, and anyone can hash those bytes and compare. Until that happens, the envelope says the prompt had this digest, and it says nothing else about the instructions.

Short, predictable text is a weak commitment. The digest of a one-word prompt, or of a tool input drawn from a small set of values, can be guessed by hashing the candidates. When the content is low-entropy, salt it or wrap it before hashing, and keep the salt with the bytes. That is a choice the producer makes. The profile has no salt field.

## Sealing a run

`@fileonchain/sdk/evidence` exposes `sealAgentRun`. It derives the subject from the output bytes, stamps `org.fileonchain.agent/v1` onto the envelope, validates the claims, collects artifact signatures from the signers you pass, and finalizes.

```ts
import { sha256HexUtf8 } from "@fileonchain/sdk/protocol";
import { sealAgentRun, storageReceipt } from "@fileonchain/sdk/evidence";

// prompt, toolInput, toolOutput, and reportBytes belong to the run.
// agentSigner is an EvidenceSigner: { signer, sign(payload) }.
const promptDigest = sha256HexUtf8(prompt);
const inputDigest = sha256HexUtf8(toolInput);
const outputDigest = sha256HexUtf8(toolOutput);

const envelope = await sealAgentRun({
  subjectBytes: reportBytes,
  subjectMeta: { name: "report.md", mediaType: "text/markdown" },
  run: {
    runId: "run_42",
    agentId: "agent_reporter",
    status: "completed",
    model: {
      provider: "anthropic",
      id: "claude-fable-5",
      promptDigest,
    },
    toolCalls: [
      { name: "web_search", inputDigest, outputDigest, status: "success" },
    ],
  },
  signers: [agentSigner],
  receipts: {
    storage: [storageReceipt({ mode: "evidence-only" })],
  },
});
```

The profile id is bound into every artifact signature's payload, together with the protocol identifier, the version, the purpose, the subject, and the claims. A signature made under `org.fileonchain.agent/v1` fails if it is moved onto an envelope with a different profile, a different subject, or a different set of claims.

`storageReceipt({ mode: "evidence-only" })` records the storage choice as a receipt. Leaving `storage` empty is also valid: the envelope then carries no storage claim at all. The other modes are opt-in. `onchain-storage` records a `fileonchain://` URI for bytes a storage system accepted. `external-storage` records an external URI. On-chain storage is permanent, so encrypt before choosing it for sensitive bytes.

The claims inside the envelope are ordinary JSON:

```json
{
  "org.fileonchain.agent": {
    "runId": "run_42",
    "agentId": "agent_reporter",
    "status": "completed",
    "model": {
      "provider": "anthropic",
      "id": "claude-fable-5",
      "promptDigest": "9b2e71…c4aa"
    },
    "toolCalls": [
      {
        "name": "web_search",
        "inputDigest": "11d0f8…e017",
        "outputDigest": "c8a441…b6d2",
        "status": "success"
      }
    ]
  }
}
```

FileOnChain Cloud's anchoring API takes a CID, a file name, a size, and a chunk count. The bytes are not part of that request. Account ids, credits, and retention rules stay in the hosted service. They are not members of a portable envelope. An envelope a stranger hands you remains checkable with the open verifier, with no FileOnChain account.

Which settlement systems are actually integrated is a separate, narrower fact. The [integrations](/integrations) page lists each network at its current status. An envelope can name a system the verifier has never heard of; that receipt is reported unknown, and the rest of the checks still run.

## An approval is its own signature

An approval claim records that someone, or some policy gate, approved something during the run. `approverId` and `type` are required. `type` is a label such as `human-review`, `policy-gate`, or `sign-off`. `subjectDigest`, when present, is the SHA-256 of exactly what was approved, which may differ from the envelope's subject. `at` is an asserted time. `policyId` names the policy the approval was made under.

On its own, the claim is an assertion by whoever signed the claims. To make the approval a separate signature, the approver signs the artifact payload with `purpose` set to `approval`, and the claim points at that signature with `signatureIndex`. The purpose is covered by the signature. An artifact signature over the output cannot be relabeled as an approval, and an approval signature cannot be relabeled as a signature of the output.

A claim with no `signatureIndex` is the artifact signer's assertion that an approval happened. Read it that way.

![Two cards labeled Artifact signature and Approval signature, with purposes artifact and approval, captioned A purpose cannot be relabeled.](/blog/images/seal-an-agent-run-approval.jpg)

An agent key may also sign `onBehalfOf` an organization. With no verifiable authorization statement, a verifier reports that delegation as claimed. The check showed that a key signed. Who holds the key, and whether that key may speak for the organization, stays a further question.

## What a relying party can answer

The profile is aimed at one question:

> What did this agent produce, in which run, under which model and policy, with which tool calls, approved by whom — and has any of it changed?

Locally verified evidence answers the checkable half. The output digest matches the bytes you were given, or the check fails. The prompt digest matches a prompt you were later shown, or it does not. The signatures verify over this subject and these claims, under this profile, or they fail. A settlement receipt, when one is attached, records that a settlement system accepted a payload naming the digest, at a time that system can speak for.

The envelope establishes integrity, the signing keys, and — through receipts — timing. It leaves the truth of the report, the identity of the model that actually ran, and the question of whether a tool call happened as described, as assertions by the signer. A signature establishes a key.

The reference verifier, `@fileonchain/verify`, returns one of four statuses: `valid`, `valid-with-warnings`, `incomplete`, or `invalid`. A signed agent envelope ordinarily comes back `valid-with-warnings`, because key status is unknown from the document alone. Unknown is a result. The [earlier post](/blog/what-an-evidence-envelope-proves) walks through what each status is allowed to say, and why artifact signatures and envelope signatures are reported on separate lines.

![A laptop receipt headed valid-with-warnings for run_42, noting that the prompt text is not in the envelope, beside a locked card labeled Prompt.](/blog/images/seal-an-agent-run-local-check.jpg)

## Check one on your own machine

[/verify](/verify) takes the envelope and asks for no account and no wallet. The same verifier is the `fileonchain` CLI:

```sh
fileonchain verify run.evidence.json --artifact report.md --json
```

`--artifact` recomputes the subject digest from the output file in front of you. The prompt stays out of that command. To check a prompt you have been shown, hash it with SHA-256 and compare the hex with `model.promptDigest`. Offline is the default. `--online` asks registered adapters to confirm receipts against public endpoints. A receipt whose adapter is absent stays unknown, and the envelope is preserved.

The document you hand someone is the envelope. The prompt, the tool payloads, and the trace bodies can remain where the run left them, and still be proven later against the digests.
