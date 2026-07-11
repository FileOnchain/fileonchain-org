import {
  artifactSigningPayload,
  artifactSigningPayloadDigest,
  addEnvelopeSignature,
  buildEnvelope,
  envelopeSigningPayload,
  envelopeSigningPayloadDigest,
  finalizeEnvelope,
  sha256Hex,
  type ArtifactSignature,
  type Claims,
  type EnvelopeSignature,
  type EvidenceEnvelope,
  type ReceiptSet,
  type SettlementReceipt,
  type SignerIdentity,
  type StorageReceipt,
  type SubjectDescriptor,
} from "@fileonchain/protocol";
import {
  buildAgentEvidence,
  AGENT_PROFILE_ID,
  type AgentClaims,
} from "@fileonchain/agent-profile";
import type { ChainId } from "@fileonchain/utils";

/**
 * `@fileonchain/sdk/evidence` — the high-level developer experience for
 * creating evidence with the reference SDK: seal an artifact or an agent
 * run, collect receipts from anchor results, finalize, and (optionally)
 * envelope-sign. Works the same whether execution is self-managed (your
 * keys, your RPC) or delegated to FileOnChain Cloud — the output is a
 * portable protocol envelope either way.
 */

/** A signing capability: an identity plus a function that signs a payload string. */
export interface EvidenceSigner {
  signer: SignerIdentity;
  /** Sign the canonical payload string; return the hex signature. */
  sign(payload: string): Promise<string> | string;
  /** Asserted signing time recorded on the signature (ISO 8601). */
  signedAt?: string;
}

/** Describe a subject from raw bytes (sha256 + size computed here). */
export const subjectFromBytes = (
  bytes: Uint8Array,
  extra: Omit<SubjectDescriptor, "type" | "digests" | "size"> & {
    type?: SubjectDescriptor["type"];
  } = {},
): SubjectDescriptor => ({
  type: extra.type ?? "artifact",
  digests: { sha256: sha256Hex(bytes) },
  size: bytes.length,
  ...(extra.cid ? { cid: extra.cid } : {}),
  ...(extra.mediaType ? { mediaType: extra.mediaType } : {}),
  ...(extra.name ? { name: extra.name } : {}),
  ...(extra.uri ? { uri: extra.uri } : {}),
});

/** Produce artifact signatures for a signing context. */
export const signArtifact = async (
  context: {
    subject: SubjectDescriptor;
    claims?: Claims;
    profile?: string;
    purpose?: string;
    scope?: { organization?: string; project?: string };
  },
  signers: EvidenceSigner[],
): Promise<ArtifactSignature[]> => {
  const payload = artifactSigningPayload(context);
  const payloadDigest = artifactSigningPayloadDigest(context);
  return Promise.all(
    signers.map(async (s) => ({
      signer: s.signer,
      payloadDigest,
      signature: await s.sign(payload),
      ...(s.signedAt ? { signedAt: s.signedAt } : {}),
      ...(context.purpose && context.purpose !== "artifact"
        ? { purpose: context.purpose }
        : {}),
      ...(context.scope ? { scope: context.scope } : {}),
    })),
  );
};

export interface CreateEvidenceParams {
  /** Either raw bytes (subject derived) or a prepared subject descriptor. */
  subjectBytes?: Uint8Array;
  subject?: SubjectDescriptor;
  /** Extra descriptor fields when deriving from bytes. */
  subjectMeta?: { name?: string; mediaType?: string; cid?: string; uri?: string };
  claims?: Claims;
  profile?: string;
  scope?: { organization?: string; project?: string };
  signers?: EvidenceSigner[];
  receipts?: Partial<ReceiptSet>;
  extensions?: Record<string, unknown>;
  createdAt?: string;
  id?: string;
}

/** Create (and finalize) a generic evidence envelope. */
export const createEvidence = async ({
  subjectBytes,
  subject,
  subjectMeta,
  claims,
  profile,
  scope,
  signers = [],
  receipts,
  extensions,
  createdAt,
  id,
}: CreateEvidenceParams): Promise<EvidenceEnvelope> => {
  const resolvedSubject =
    subject ??
    (subjectBytes ? subjectFromBytes(subjectBytes, subjectMeta ?? {}) : undefined);
  if (!resolvedSubject) throw new Error("createEvidence needs subject or subjectBytes.");
  const signatures = await signArtifact(
    { subject: resolvedSubject, claims, profile, scope },
    signers,
  );
  return buildEnvelope({
    subject: resolvedSubject,
    claims,
    profile,
    signatures,
    receipts,
    extensions,
    createdAt,
    id,
  });
};

export interface SealAgentRunParams extends Omit<CreateEvidenceParams, "profile" | "claims"> {
  /** The Agent Evidence Profile claims (runId and agentId required). */
  run: AgentClaims;
  /** Additional claim namespaces beyond the agent claims. */
  claims?: Claims;
}

/** Seal an agent run as Agent Evidence Profile evidence. */
export const sealAgentRun = async ({
  run,
  claims,
  subjectBytes,
  subject,
  subjectMeta,
  scope,
  signers = [],
  receipts,
  extensions,
  createdAt,
  id,
}: SealAgentRunParams): Promise<EvidenceEnvelope> => {
  const resolvedSubject =
    subject ??
    (subjectBytes ? subjectFromBytes(subjectBytes, subjectMeta ?? {}) : undefined);
  if (!resolvedSubject) throw new Error("sealAgentRun needs subject or subjectBytes.");
  const fullClaims: Claims = { ...claims, "org.fileonchain.agent": run };
  const signatures = await signArtifact(
    { subject: resolvedSubject, claims: fullClaims, profile: AGENT_PROFILE_ID, scope },
    signers,
  );
  return buildAgentEvidence({
    subject: resolvedSubject,
    run,
    claims,
    signatures,
    receipts,
    extensions,
    createdAt,
    id,
  });
};

/** Wrap an anchor send into a settlement receipt (EVM gets its dedicated adapter). */
export const settlementReceiptFromAnchor = ({
  chainId,
  txHash,
  blockNumber,
  blockHash,
  timestamp,
  payload,
  submitter,
}: {
  chainId: ChainId;
  txHash: string;
  blockNumber?: number;
  blockHash?: string;
  timestamp?: string;
  payload?: string;
  submitter?: string;
}): SettlementReceipt => {
  const [family, ref] = chainId.split(":");
  return {
    type: "settlement",
    adapter: family === "evm" ? "fileonchain-evm-anchor/v1" : "fileonchain-anchor/v1",
    system: family === "evm" ? `eip155:${ref}` : chainId,
    payload: {
      chainId,
      txHash,
      ...(blockNumber !== undefined ? { blockNumber } : {}),
      ...(blockHash ? { blockHash } : {}),
      ...(timestamp ? { timestamp } : {}),
      ...(payload ? { payload } : {}),
      ...(submitter ? { submitter } : {}),
    },
  };
};

/** Storage receipt helpers for the three modes. */
export const storageReceipt = (
  payload:
    | { mode: "evidence-only" }
    | { mode: "onchain-storage"; uri: string; chainId?: ChainId; txHashes?: string[] }
    | { mode: "external-storage"; uri: string; provider?: string },
): StorageReceipt => ({
  type: "storage",
  adapter: "fileonchain-storage/v1",
  payload: { ...payload },
});

/** Envelope-sign a finalized envelope with the given signers. */
export const signEnvelope = async (
  envelope: EvidenceEnvelope,
  signers: EvidenceSigner[],
): Promise<EvidenceEnvelope> => {
  const finalized = envelope.envelope ? envelope : finalizeEnvelope(envelope);
  const digest = finalized.envelope!.digest.sha256;
  const payload = envelopeSigningPayload(digest);
  const payloadDigest = envelopeSigningPayloadDigest(digest);
  let out = finalized;
  for (const s of signers) {
    const signature: EnvelopeSignature = {
      signer: s.signer,
      payloadDigest,
      signature: await s.sign(payload),
      ...(s.signedAt ? { signedAt: s.signedAt } : {}),
    };
    out = addEnvelopeSignature(out, signature);
  }
  return out;
};
