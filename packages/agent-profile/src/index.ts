import {
  buildEnvelope,
  registerProfile,
  type ArtifactSignature,
  type EvidenceEnvelope,
  type ProfileDefinition,
  type ReceiptSet,
  type SubjectDescriptor,
} from "@fileonchain/protocol";

/**
 * FileOnChain Agent Evidence Profile v1 — the first official application
 * profile of the FileOnChain Evidence Protocol.
 *
 * Where the core protocol is neutral, this profile is opinionated: it
 * defines how AI-agent runs, outputs, tool calls, approvals, and policies
 * are represented as namespaced claims (`org.fileonchain.agent`), which
 * of those claims are required, and how to seal them. Raw prompts and
 * full observability payloads are never required — the profile references
 * and hashes; it does not copy.
 *
 * Normative reference: docs/profiles/agent-evidence-v1.md.
 */

export const AGENT_PROFILE_ID = "org.fileonchain.agent/v1" as const;
export const AGENT_CLAIMS_NAMESPACE = "org.fileonchain.agent" as const;

/* ------------------------------------------------------------------ */
/* Claim types                                                         */
/* ------------------------------------------------------------------ */

export type AgentRunStatus = "completed" | "failed" | "cancelled" | "running";

/** Model metadata — hashes and identifiers only; raw prompts are never required. */
export interface AgentModelClaim {
  provider?: string;
  id: string;
  version?: string;
  /** SHA-256 (hex) of the canonical model configuration. */
  configDigest?: string;
  /** SHA-256 (hex) of the prompt / instruction content. */
  promptDigest?: string;
  /** Prompt-template identifier, when templates are versioned separately. */
  templateId?: string;
}

export interface AgentToolCallClaim {
  name: string;
  version?: string;
  /** SHA-256 (hex) of the tool input. */
  inputDigest?: string;
  /** SHA-256 (hex) of the tool output. */
  outputDigest?: string;
  /** Execution timestamp (ISO 8601). */
  at?: string;
  status?: "success" | "failure";
  /** External trace reference (OpenTelemetry span, Langfuse trace, …). */
  traceRef?: string;
}

export interface AgentApprovalClaim {
  /** Approver identity (human id, service id). */
  approverId: string;
  /** Approval type — e.g. "human-review", "policy-gate", "sign-off". */
  type: string;
  at?: string;
  /** SHA-256 (hex) of exactly what was approved. */
  subjectDigest?: string;
  /** Policy the approval was made under. */
  policyId?: string;
  /**
   * Index into the envelope's artifact signatures when the approval is
   * backed by a cryptographic signature with purpose "approval".
   */
  signatureIndex?: number;
}

export interface AgentPolicyClaim {
  id: string;
  version?: string;
  /** SHA-256 (hex) of the policy document. */
  digest?: string;
  /** Enforcement outcome — e.g. "passed", "failed", "overridden". */
  result?: string;
  uri?: string;
}

/** Reference to an external trace — referenced or hashed, never copied wholesale. */
export interface AgentTraceRef {
  /** Trace system — e.g. "opentelemetry", "langfuse", "langsmith", "openai-agents", "mcp". */
  system: string;
  uri?: string;
  /** SHA-256 (hex) of the exported trace document, when captured. */
  digest?: string;
}

/** The `org.fileonchain.agent` claims object. */
export interface AgentClaims {
  /** Required: the run this evidence belongs to. */
  runId: string;
  /** Required: the agent that produced it. */
  agentId: string;
  sessionId?: string;
  parentRunId?: string;
  organizationId?: string;
  /** Execution environment — e.g. "production", "staging", a hostname. */
  environment?: string;
  startedAt?: string;
  completedAt?: string;
  status?: AgentRunStatus;
  model?: AgentModelClaim;
  toolCalls?: AgentToolCallClaim[];
  approvals?: AgentApprovalClaim[];
  policy?: AgentPolicyClaim;
  traceRefs?: AgentTraceRef[];
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const HEX_64 = /^[0-9a-f]{64}$/;

/** Validate an `org.fileonchain.agent` claims object. Empty array = valid. */
export const validateAgentClaims = (value: unknown): string[] => {
  const errors: string[] = [];
  const claims = value as Partial<AgentClaims> | null;
  if (!claims || typeof claims !== "object") return ["agent claims must be an object"];
  if (typeof claims.runId !== "string" || claims.runId.length === 0) {
    errors.push("runId is required");
  }
  if (typeof claims.agentId !== "string" || claims.agentId.length === 0) {
    errors.push("agentId is required");
  }
  if (claims.model && typeof claims.model.id !== "string") {
    errors.push("model.id is required when model is present");
  }
  for (const key of ["configDigest", "promptDigest"] as const) {
    const digest = claims.model?.[key];
    if (digest !== undefined && !HEX_64.test(digest)) {
      errors.push(`model.${key} is not 64 lowercase hex chars`);
    }
  }
  claims.toolCalls?.forEach((call, i) => {
    if (typeof call?.name !== "string") errors.push(`toolCalls[${i}].name is required`);
    for (const key of ["inputDigest", "outputDigest"] as const) {
      const digest = call?.[key];
      if (digest !== undefined && !HEX_64.test(digest)) {
        errors.push(`toolCalls[${i}].${key} is not 64 lowercase hex chars`);
      }
    }
  });
  claims.approvals?.forEach((approval, i) => {
    if (typeof approval?.approverId !== "string") {
      errors.push(`approvals[${i}].approverId is required`);
    }
    if (typeof approval?.type !== "string") errors.push(`approvals[${i}].type is required`);
  });
  if (claims.policy && typeof claims.policy.id !== "string") {
    errors.push("policy.id is required when policy is present");
  }
  return errors;
};

/** The profile definition, registered with the protocol on import. */
export const agentEvidenceProfile: ProfileDefinition = {
  id: AGENT_PROFILE_ID,
  namespaces: [AGENT_CLAIMS_NAMESPACE],
  validate(envelope: EvidenceEnvelope): string[] {
    const claims = envelope.claims?.[AGENT_CLAIMS_NAMESPACE];
    if (claims === undefined) {
      return [`profile ${AGENT_PROFILE_ID} requires claims["${AGENT_CLAIMS_NAMESPACE}"]`];
    }
    return validateAgentClaims(claims).map((e) => `${AGENT_CLAIMS_NAMESPACE}: ${e}`);
  },
};

registerProfile(agentEvidenceProfile);

/* ------------------------------------------------------------------ */
/* Building agent evidence                                             */
/* ------------------------------------------------------------------ */

export interface BuildAgentEvidenceParams {
  /** What the evidence is about — an output artifact, a run manifest, an event record. */
  subject: SubjectDescriptor;
  run: AgentClaims;
  /** Additional claim namespaces beyond the agent claims. */
  claims?: Record<string, unknown>;
  signatures?: ArtifactSignature[];
  receipts?: Partial<ReceiptSet>;
  extensions?: Record<string, unknown>;
  createdAt?: string;
  id?: string;
  finalize?: boolean;
}

/**
 * Assemble an Agent Evidence Profile envelope: the run claims land under
 * `org.fileonchain.agent`, the profile id is stamped (and therefore bound
 * into every artifact signature's signing payload), and required claims
 * are validated.
 */
export const buildAgentEvidence = ({
  subject,
  run,
  claims,
  signatures,
  receipts,
  extensions,
  createdAt,
  id,
  finalize,
}: BuildAgentEvidenceParams): EvidenceEnvelope => {
  const errors = validateAgentClaims(run);
  if (errors.length > 0) throw new Error(`Invalid agent claims: ${errors.join("; ")}`);
  return buildEnvelope({
    subject,
    profile: AGENT_PROFILE_ID,
    claims: { ...claims, [AGENT_CLAIMS_NAMESPACE]: run },
    signatures,
    receipts,
    extensions,
    createdAt,
    id,
    finalize,
  });
};
