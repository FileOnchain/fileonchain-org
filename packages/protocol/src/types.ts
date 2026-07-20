/**
 * FileOnChain Evidence Protocol — core types.
 *
 * The protocol is deliberately neutral: a subject may be a file, an event,
 * a manifest of an agent run, a software release, or an abstract resource
 * identified only by a digest or URI. Nothing in this module is specific
 * to AI agents, blockchains, or FileOnChain's hosted product — application
 * semantics live in *profiles* (namespaced claims), and system-specific
 * receipt fields live in *adapters*.
 *
 * Normative reference: docs/protocol/evidence-protocol.md. "Evidence
 * envelope" is the precise protocol term; "evidence package" survives as
 * user-facing language for the same thing.
 */

export const PROTOCOL_ID = "fileonchain-evidence" as const;
export const PROTOCOL_VERSION = 1 as const;
/** Suggested media type for exported `.evidence.json` envelopes. */
export const EVIDENCE_MEDIA_TYPE =
  "application/vnd.fileonchain.evidence+json" as const;

/* ------------------------------------------------------------------ */
/* Subject                                                             */
/* ------------------------------------------------------------------ */

/**
 * What the evidence is about. `artifact` is concrete bytes; `manifest` is
 * a document listing other subjects (usually Merkle-batched); `collection`
 * groups subjects without a manifest document; `event` is an occurrence
 * (a tool call, an approval) whose canonical record was hashed;
 * `resource` is an external, URI-identified thing; `abstract` is anything
 * else identified by digest or URI.
 */
export type SubjectType =
  | "artifact"
  | "manifest"
  | "collection"
  | "event"
  | "resource"
  | "abstract";

/**
 * Digest set, keyed by lowercase algorithm name. `sha256` (lowercase hex)
 * is the algorithm every conforming implementation MUST support; other
 * algorithms MAY be present alongside it.
 */
export type DigestSet = { sha256?: string } & Record<string, string | undefined>;

/** The subject descriptor. A subject MUST carry at least one digest or a URI. */
export interface SubjectDescriptor {
  type: SubjectType;
  /** Content digests of the subject's canonical bytes. */
  digests?: DigestSet;
  /** Stable identifier for resource/abstract subjects (or a locator hint). */
  uri?: string;
  /** CIDv1 (base32), when content-addressed naming is in use. */
  cid?: string;
  /** MIME type of the subject bytes, when known. */
  mediaType?: string;
  /** Size in bytes, when known. */
  size?: number;
  /** Human-oriented name. */
  name?: string;
}

/* ------------------------------------------------------------------ */
/* Claims                                                              */
/* ------------------------------------------------------------------ */

/**
 * Namespaced claims. Keys are reverse-DNS namespaces
 * (e.g. `"org.fileonchain.agent"`); values are profile-defined objects.
 * Claims are covered by artifact signatures when present at signing time,
 * but a signed claim is an *assertion by the signer* — never proven true
 * by the signature. Conforming implementations MUST preserve unknown
 * claim namespaces byte-for-byte (after canonicalization).
 */
export type Claims = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Signatures                                                          */
/* ------------------------------------------------------------------ */

export type SignerKind = "wallet" | "organization" | "agent" | "human" | "service";

/** Signature schemes conforming verifiers MUST support. */
export type SignatureScheme = "eip191" | "ed25519";

/** Who (or what) produced a signature, and with which key. */
export interface SignerIdentity {
  kind: SignerKind;
  /**
   * Stable identifier for the signer — an address, a DID, a domain, an
   * agent id. Optional where `publicKey` is the identity.
   */
  id?: string;
  /**
   * Key material the signature verifies against: an EVM address for
   * `eip191`, a 32-byte lowercase-hex public key for `ed25519`.
   */
  publicKey: string;
  scheme: SignatureScheme;
  /**
   * Delegated signing: the identity this signer acts for. `authorization`
   * may carry an independently verifiable delegation statement; without
   * one, verifiers report the delegation as claimed, not proven.
   */
  onBehalfOf?: {
    kind: SignerKind;
    id: string;
    authorization?: string;
  };
  /**
   * Where the key's rotation/revocation status can be checked. Verifiers
   * report key status as *unknown* when absent — a signature alone cannot
   * prove the key was unrevoked at signing time.
   */
  keyStatusUrl?: string;
}

/**
 * An **artifact signature** answers: who signed or approved the subject
 * and its claims? It is computed over the artifact signing payload
 * (see `artifactSigningPayload`), which binds the protocol id and
 * version, the profile (when set), the purpose, the subject, the claims,
 * and any scope — so a signature made in one context cannot be replayed
 * in another without detection.
 */
export interface ArtifactSignature {
  signer: SignerIdentity;
  /** SHA-256 (hex) of the canonical signing payload the signer signed. */
  payloadDigest: string;
  /** Scheme-dependent signature encoding (hex). */
  signature: string;
  /** Asserted signing time (ISO 8601) — receipts prove time; this is claimed. */
  signedAt?: string;
  /**
   * Intended purpose, bound into the signing payload. Defaults to
   * `"artifact"`. Profiles may define additional purposes (e.g.
   * `"approval"`).
   */
  purpose?: string;
  /**
   * Organization / project scope bound into the signing payload, when the
   * signer wants the signature valid only within that scope.
   */
  scope?: { organization?: string; project?: string };
}

/**
 * An **envelope signature** answers: who assembled, exported, or approved
 * this complete envelope — receipts included? It signs the envelope
 * digest (see `envelopeSigningPayload`) and is stored under `envelope`,
 * outside the digested region, so multiple envelope signatures can be
 * added without invalidating each other.
 */
export interface EnvelopeSignature {
  signer: SignerIdentity;
  /** SHA-256 (hex) of the canonical envelope signing payload. */
  payloadDigest: string;
  signature: string;
  signedAt?: string;
}

/* ------------------------------------------------------------------ */
/* Receipts — tagged adapter schemas                                   */
/* ------------------------------------------------------------------ */

export type ReceiptType = "storage" | "settlement" | "inclusion";

/**
 * The generic receipt shell. The core protocol does not hardcode any
 * system-specific field: `adapter` names the receipt format
 * (`"<name>/v<major>"`), `system` identifies the external system where
 * applicable (CAIP-2 for chains, e.g. `"eip155:11155111"`), and `payload`
 * is defined entirely by the adapter's own specification — including its
 * offline checks, online checks, finality behavior, and error states.
 */
export interface Receipt {
  type: ReceiptType;
  adapter: string;
  system?: string;
  payload: Record<string, unknown>;
}

export interface StorageReceipt extends Receipt {
  type: "storage";
}

export interface SettlementReceipt extends Receipt {
  type: "settlement";
  system: string;
}

export interface InclusionReceipt extends Receipt {
  type: "inclusion";
}

export interface ReceiptSet {
  storage: StorageReceipt[];
  settlement: SettlementReceipt[];
  inclusion: InclusionReceipt[];
}

/* ------------------------------------------------------------------ */
/* The envelope                                                        */
/* ------------------------------------------------------------------ */

/**
 * The finalization block. `digest.sha256` is the deterministic digest of
 * the canonical envelope with the entire `envelope` member removed — so
 * adding, removing, or reordering any receipt, claim, or signature in the
 * digested region changes the digest, while envelope signatures can
 * accumulate without changing it.
 */
export interface EnvelopeFinalization {
  digest: { sha256: string };
  signatures: EnvelopeSignature[];
}

export interface EvidenceEnvelope {
  protocol: typeof PROTOCOL_ID;
  version: typeof PROTOCOL_VERSION;
  /** Producer-assigned identifier (opaque to the protocol). */
  id?: string;
  /**
   * Application profile in force, e.g. `"org.fileonchain.agent/v1"`.
   * Bound into artifact signing payloads when present.
   */
  profile?: string;
  subject: SubjectDescriptor;
  claims?: Claims;
  /** Artifact signatures — zero or more. Unsigned envelopes prove integrity + time only. */
  signatures: ArtifactSignature[];
  receipts: ReceiptSet;
  /**
   * Non-claim extension data. Conforming implementations MUST preserve
   * unknown extensions. Namespaced like claims.
   */
  extensions?: Record<string, unknown>;
  /** Producer-asserted creation time (ISO 8601). */
  createdAt?: string;
  /** Present once finalized. Absent on drafts. */
  envelope?: EnvelopeFinalization;
}
