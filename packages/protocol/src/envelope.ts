import { canonicalStringify } from "./canonical";
import { sha256HexUtf8 } from "./sha256";
import {
  PROTOCOL_ID,
  PROTOCOL_VERSION,
  type ArtifactSignature,
  type Claims,
  type EnvelopeSignature,
  type EvidenceEnvelope,
  type ReceiptSet,
  type SubjectDescriptor,
} from "./types";

/* ------------------------------------------------------------------ */
/* Signing payloads                                                    */
/* ------------------------------------------------------------------ */

export interface ArtifactSigningContext {
  subject: SubjectDescriptor;
  claims?: Claims;
  /** Application profile in force (bound when present). */
  profile?: string;
  /** Signature purpose; defaults to "artifact". */
  purpose?: string;
  /** Organization / project scope the signature is limited to. */
  scope?: { organization?: string; project?: string };
}

/**
 * The canonical byte string an artifact signer signs. It binds the
 * protocol identifier and version, the profile (when set), the purpose,
 * the subject descriptor, the claims, and the scope — preventing a
 * signature created in one context (another profile, another purpose,
 * another organization) from being replayed in this one.
 *
 * Receipts are deliberately excluded: they are produced after signing and
 * each is independently verifiable on its own system. Binding the *whole*
 * envelope, receipts included, is the envelope signature's job.
 */
export const artifactSigningPayload = ({
  subject,
  claims,
  profile,
  purpose = "artifact",
  scope,
}: ArtifactSigningContext): string =>
  canonicalStringify({
    protocol: PROTOCOL_ID,
    version: PROTOCOL_VERSION,
    purpose,
    ...(profile ? { profile } : {}),
    subject,
    ...(claims && Object.keys(claims).length > 0 ? { claims } : {}),
    ...(scope ? { scope } : {}),
  });

/** SHA-256 (hex) of the artifact signing payload — what `ArtifactSignature.payloadDigest` must equal. */
export const artifactSigningPayloadDigest = (context: ArtifactSigningContext): string =>
  sha256HexUtf8(artifactSigningPayload(context));

/**
 * The canonical byte string an envelope signer signs: the protocol
 * identity, the purpose `"envelope"`, and the envelope digest. Because
 * the digest covers every receipt, claim, and artifact signature, an
 * envelope signature attests to the complete assembled envelope.
 */
export const envelopeSigningPayload = (envelopeDigestSha256: string): string =>
  canonicalStringify({
    protocol: PROTOCOL_ID,
    version: PROTOCOL_VERSION,
    purpose: "envelope",
    envelopeDigest: { sha256: envelopeDigestSha256 },
  });

/** SHA-256 (hex) of the envelope signing payload. */
export const envelopeSigningPayloadDigest = (envelopeDigestSha256: string): string =>
  sha256HexUtf8(envelopeSigningPayload(envelopeDigestSha256));

/* ------------------------------------------------------------------ */
/* Envelope digest                                                     */
/* ------------------------------------------------------------------ */

/**
 * Deterministic digest of the envelope: canonical JSON of the envelope
 * with the entire `envelope` member removed, SHA-256, lowercase hex.
 * Any change inside the digested region — a receipt added, removed, or
 * reordered; a claim edited; a signature dropped — changes this value.
 */
export const computeEnvelopeDigest = (envelope: EvidenceEnvelope): string => {
  const { envelope: _finalization, ...digested } = envelope;
  return sha256HexUtf8(canonicalStringify(digested));
};

/**
 * Finalize a draft: stamp the envelope digest (and keep any existing
 * envelope signatures whose digest still matches — signatures over a
 * stale digest are dropped, because they attest to a different envelope).
 */
export const finalizeEnvelope = (envelope: EvidenceEnvelope): EvidenceEnvelope => {
  const digest = computeEnvelopeDigest(envelope);
  const expected = envelopeSigningPayloadDigest(digest);
  const carried = (envelope.envelope?.signatures ?? []).filter(
    (sig) => sig.payloadDigest === expected,
  );
  return { ...envelope, envelope: { digest: { sha256: digest }, signatures: carried } };
};

/** Attach an envelope signature to a finalized envelope. */
export const addEnvelopeSignature = (
  envelope: EvidenceEnvelope,
  signature: EnvelopeSignature,
): EvidenceEnvelope => {
  if (!envelope.envelope) {
    throw new Error("Cannot add an envelope signature to a draft — finalize first.");
  }
  return {
    ...envelope,
    envelope: {
      ...envelope.envelope,
      signatures: [...envelope.envelope.signatures, signature],
    },
  };
};

/* ------------------------------------------------------------------ */
/* Building                                                            */
/* ------------------------------------------------------------------ */

export interface BuildEnvelopeParams {
  subject: SubjectDescriptor;
  claims?: Claims;
  profile?: string;
  id?: string;
  signatures?: ArtifactSignature[];
  receipts?: Partial<ReceiptSet>;
  extensions?: Record<string, unknown>;
  createdAt?: string;
  /** Compute the envelope digest immediately (default true). */
  finalize?: boolean;
}

/** Assemble an envelope (does not sign or settle anything by itself). */
export const buildEnvelope = ({
  subject,
  claims,
  profile,
  id,
  signatures = [],
  receipts,
  extensions,
  createdAt,
  finalize = true,
}: BuildEnvelopeParams): EvidenceEnvelope => {
  const envelope: EvidenceEnvelope = {
    protocol: PROTOCOL_ID,
    version: PROTOCOL_VERSION,
    ...(id ? { id } : {}),
    ...(profile ? { profile } : {}),
    subject,
    ...(claims && Object.keys(claims).length > 0 ? { claims } : {}),
    signatures,
    receipts: {
      storage: receipts?.storage ?? [],
      settlement: receipts?.settlement ?? [],
      inclusion: receipts?.inclusion ?? [],
    },
    ...(extensions && Object.keys(extensions).length > 0 ? { extensions } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
  const errors = validateEnvelope(envelope);
  if (errors.length > 0) throw new Error(`Invalid evidence envelope: ${errors.join("; ")}`);
  return finalize ? finalizeEnvelope(envelope) : envelope;
};

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const HEX_64 = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const NAMESPACE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const SUBJECT_TYPES = new Set([
  "artifact",
  "manifest",
  "collection",
  "event",
  "resource",
  "abstract",
]);
const RECEIPT_ADAPTER = /^[a-z0-9][a-z0-9-]*(\/v\d+)$/;

/**
 * Structural validation of an envelope (draft or finalized). Returns a
 * list of problems; empty = structurally valid. Cryptographic checks —
 * digests, signatures, inclusion proofs, receipts — are the verifier's
 * job. Unknown claim namespaces and extensions are NOT errors: they must
 * be preserved, not rejected.
 */
export const validateEnvelope = (value: unknown): string[] => {
  const errors: string[] = [];
  const env = value as Partial<EvidenceEnvelope> | null;
  if (!env || typeof env !== "object") return ["not an object"];
  if (env.protocol !== PROTOCOL_ID) errors.push(`protocol must be "${PROTOCOL_ID}"`);
  if (env.version !== PROTOCOL_VERSION) errors.push(`version must be ${PROTOCOL_VERSION}`);

  const subject = env.subject as Partial<SubjectDescriptor> | undefined;
  if (!subject || typeof subject !== "object") {
    errors.push("subject missing");
  } else {
    if (typeof subject.type !== "string" || !SUBJECT_TYPES.has(subject.type)) {
      errors.push(`subject.type must be one of ${[...SUBJECT_TYPES].join("|")}`);
    }
    const digests = subject.digests ?? {};
    const digestEntries = Object.entries(digests).filter(([, v]) => typeof v === "string");
    if (digestEntries.length === 0 && typeof subject.uri !== "string") {
      errors.push("subject needs at least one digest or a uri");
    }
    if (typeof digests.sha256 === "string" && !HEX_64.test(digests.sha256)) {
      errors.push("subject.digests.sha256 is not 64 lowercase hex chars");
    }
  }

  if (env.claims !== undefined) {
    if (typeof env.claims !== "object" || env.claims === null || Array.isArray(env.claims)) {
      errors.push("claims must be an object of namespaced entries");
    } else {
      for (const key of Object.keys(env.claims)) {
        if (!NAMESPACE.test(key)) {
          errors.push(`claims namespace "${key}" is not reverse-DNS (e.g. org.example.thing)`);
        }
      }
    }
  }

  if (!Array.isArray(env.signatures)) {
    errors.push("signatures must be an array");
  } else {
    env.signatures.forEach((sig, i) => {
      if (!sig?.signer?.publicKey) errors.push(`signatures[${i}].signer.publicKey missing`);
      if (sig?.signer && sig.signer.scheme !== "eip191" && sig.signer.scheme !== "ed25519") {
        errors.push(`signatures[${i}].signer.scheme unknown`);
      }
      if (typeof sig?.payloadDigest !== "string" || !HEX_64.test(sig.payloadDigest)) {
        errors.push(`signatures[${i}].payloadDigest is not 64 hex chars`);
      }
      if (typeof sig?.signature !== "string" || sig.signature.length === 0) {
        errors.push(`signatures[${i}].signature missing`);
      }
    });
  }

  const receipts = env.receipts as Partial<ReceiptSet> | undefined;
  if (!receipts || typeof receipts !== "object") {
    errors.push("receipts missing (use empty arrays)");
  } else {
    for (const kind of ["storage", "settlement", "inclusion"] as const) {
      const list = receipts[kind];
      if (!Array.isArray(list)) {
        errors.push(`receipts.${kind} must be an array`);
        continue;
      }
      list.forEach((receipt, i) => {
        if (receipt?.type !== kind) errors.push(`receipts.${kind}[${i}].type must be "${kind}"`);
        if (typeof receipt?.adapter !== "string" || !RECEIPT_ADAPTER.test(receipt.adapter)) {
          errors.push(`receipts.${kind}[${i}].adapter must look like "name/v1"`);
        }
        if (kind === "settlement" && typeof receipt?.system !== "string") {
          errors.push(`receipts.settlement[${i}].system missing`);
        }
        if (typeof receipt?.payload !== "object" || receipt.payload === null) {
          errors.push(`receipts.${kind}[${i}].payload must be an object`);
        }
      });
    }
  }

  if (env.createdAt !== undefined && !ISO_DATE.test(env.createdAt)) {
    errors.push("createdAt must be an ISO 8601 timestamp");
  }

  if (env.envelope !== undefined) {
    if (!HEX_64.test(env.envelope?.digest?.sha256 ?? "")) {
      errors.push("envelope.digest.sha256 is not 64 hex chars");
    }
    if (!Array.isArray(env.envelope?.signatures)) {
      errors.push("envelope.signatures must be an array");
    }
  }
  return errors;
};

/** Parse a serialized envelope; null when it isn't one. */
export const parseEnvelope = (raw: string): EvidenceEnvelope | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return validateEnvelope(parsed).length === 0 ? (parsed as EvidenceEnvelope) : null;
  } catch {
    return null;
  }
};
