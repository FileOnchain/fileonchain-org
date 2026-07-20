import type { ChainId } from "./types";
import { isValidCID } from "./cid";
import { sha256HexUtf8 } from "./sha256";

/**
 * The evidence package — FileOnChain's core v1 artifact.
 *
 * An evidence package is a portable JSON document that bundles everything an
 * independent verifier needs to check a claim about an artifact:
 *
 *   1. Content integrity — the artifact's CID and SHA-256.
 *   2. Identity & attribution — who (or what) signed it, with what key,
 *      including delegated signing (an agent acting for an organization).
 *   3. Storage — where the bytes live and the receipts proving it.
 *   4. Settlement & timestamping — the on-chain transactions that anchored
 *      the artifact (or the manifest that includes it).
 *
 * Verification is deterministic and local: recompute hashes, check
 * signatures against the embedded public keys, check Merkle inclusion, and
 * (optionally, online) confirm each receipt against a public node. No
 * FileOnChain service is required.
 *
 * What a package does NOT claim: that the artifact is true, legally valid,
 * or factually accurate — only that these bytes existed, were signed by
 * these keys, and were anchored at these times on these systems.
 *
 * Canonical encoding: signatures and package hashes are computed over the
 * canonical JSON form (recursively sorted object keys, no insignificant
 * whitespace, UTF-8) produced by `canonicalStringify`. Every implementation
 * must produce byte-identical canonical output for the same package.
 */

export const EVIDENCE_PROTOCOL = "fileonchain-evidence" as const;
export const EVIDENCE_PACKAGE_VERSION = 1 as const;
/** Suggested media type for `.evidence.json` files. */
export const EVIDENCE_MEDIA_TYPE =
  "application/vnd.fileonchain.evidence+json" as const;

/* ------------------------------------------------------------------ */
/* Canonical JSON                                                      */
/* ------------------------------------------------------------------ */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Deterministic JSON serialization: object keys sorted lexicographically at
 * every depth, arrays in place, no whitespace. Throws on values JSON cannot
 * represent deterministically (undefined, NaN, Infinity, functions).
 */
export const canonicalStringify = (value: unknown): string => {
  const canon = (v: unknown): JsonValue => {
    if (v === null) return null;
    if (typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new Error("Non-finite numbers are not canonical JSON.");
      return v;
    }
    if (Array.isArray(v)) return v.map(canon);
    if (typeof v === "object") {
      const out: { [key: string]: JsonValue } = {};
      for (const key of Object.keys(v as object).sort()) {
        const item = (v as Record<string, unknown>)[key];
        if (item === undefined) continue; // match JSON.stringify semantics
        out[key] = canon(item);
      }
      return out;
    }
    throw new Error(`Value of type "${typeof v}" is not canonical JSON.`);
  };
  return JSON.stringify(canon(value));
};

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

/**
 * How the artifact's bytes are (or aren't) persisted. The developer picks
 * per artifact; "evidence-only" is the default and the right choice for
 * most agent logs and sensitive content.
 */
export type StorageMode = "evidence-only" | "onchain-storage" | "external-storage";

/** The artifact the package is about. */
export interface ArtifactDescriptor {
  /** CIDv1 (base32) over the raw bytes. */
  cid: string;
  /** SHA-256 (lowercase hex) of the raw bytes. */
  sha256: string;
  /** Size in bytes, when known. */
  byteLength?: number;
  /** MIME type, when known. */
  mediaType?: string;
  /** Human-oriented name (file name, report title). */
  name?: string;
  /**
   * How the artifact was created — flat, machine-readable provenance for
   * agent workflows: model id, prompt hash, tool versions, run id, etc.
   * Values are scalars so the canonical encoding stays unambiguous.
   */
  metadata?: Record<string, string | number | boolean>;
}

export type SignerKind = "wallet" | "organization" | "agent" | "human" | "service";

/** Signature schemes a v1 verifier understands. */
export type SignatureScheme = "eip191" | "ed25519";

/** Who (or what) produced a signature, and with which key. */
export interface SignerIdentity {
  kind: SignerKind;
  /**
   * Stable identifier for the signer — an address, a DID, a domain, an
   * agent id. Optional for bare wallet signatures where `publicKey` is the
   * identity.
   */
  id?: string;
  /**
   * The key material a verifier checks the signature against: an EVM
   * address for `eip191`, a 32-byte hex public key for `ed25519`.
   */
  publicKey: string;
  scheme: SignatureScheme;
  /**
   * Delegated signing: the identity this signer acts for (e.g. an agent
   * key signing on behalf of an organization). `authorization` may carry a
   * verifiable delegation statement (itself signed by the principal's key).
   */
  onBehalfOf?: {
    kind: SignerKind;
    id: string;
    /** Serialized, independently verifiable delegation statement. */
    authorization?: string;
  };
  /**
   * Where the current status (rotation / revocation) of this key can be
   * checked. A verifier reports key status as "unknown" when absent — a
   * signature alone cannot prove the key was unrevoked at signing time.
   */
  keyStatusUrl?: string;
}

/** One signature over the package's signing payload. */
export interface EvidenceSignature {
  signer: SignerIdentity;
  /** SHA-256 (hex) of the canonical signing payload — see `signingPayload`. */
  payloadHash: string;
  /** Scheme-dependent signature encoding (hex). */
  signature: string;
  /** Claimed signing time (ISO 8601). Settlement receipts prove time; this is asserted. */
  signedAt?: string;
}

/** Where the bytes live, and the receipt proving it. */
export interface StorageReceipt {
  mode: StorageMode;
  /**
   * Locator: a `fileonchain://<chainId>/<cid>` URI for on-chain storage, or
   * an external URI (`ipfs://…`, `https://…`). Absent for evidence-only.
   */
  uri?: string;
  /** Chain holding the bytes, for on-chain storage. */
  chainId?: ChainId;
  /** Transactions that carry the chunk data, for on-chain storage. */
  txHashes?: string[];
  /** External provider name, for external storage. */
  provider?: string;
}

/**
 * One settlement receipt: a transaction on a public system that anchored
 * the artifact (or its manifest). Each receipt is independently verifiable
 * against any node or explorer of that system. Multiple receipts on
 * multiple chains are independent attestations — writing the same CID to
 * several chains does NOT create a trust-minimized proof between those
 * chains; it gives the holder several independent receipts.
 */
export interface SettlementReceipt {
  chainId: ChainId;
  txHash: string;
  blockNumber?: number;
  blockHash?: string;
  /** Block timestamp as read from the chain (ISO 8601). */
  timestamp?: string;
  /** The anchor payload written on-chain, verbatim, when available. */
  payload?: string;
  /** Address/account that submitted the transaction. */
  submitter?: string;
}

/**
 * Merkle inclusion of this artifact in a batch-anchored manifest: the
 * settlement receipts then reference the manifest's root rather than the
 * artifact's own CID. See `manifest.ts`.
 */
export interface MerkleInclusion {
  /** Merkle root (hex) the settlement transaction anchored. */
  root: string;
  /** Zero-based leaf index of this artifact. */
  leafIndex: number;
  /** Sibling hashes (hex), leaf-to-root. */
  proof: string[];
  /** SHA-256 (hex) of the canonical manifest document, when known. */
  manifestHash?: string;
}

/** The portable evidence package. */
export interface EvidencePackage {
  p: typeof EVIDENCE_PROTOCOL;
  v: typeof EVIDENCE_PACKAGE_VERSION;
  artifact: ArtifactDescriptor;
  /** Zero or more signatures — unsigned packages prove integrity + time only. */
  signatures: EvidenceSignature[];
  /** Zero or more storage receipts. */
  storage: StorageReceipt[];
  /** Zero or more settlement receipts. */
  settlements: SettlementReceipt[];
  /** Present when the artifact was batch-anchored through a manifest. */
  inclusion?: MerkleInclusion;
  /** Package creation time (ISO 8601) — asserted by the producer. */
  createdAt: string;
  /** Workflow/session identifier tying related packages together. */
  sessionId?: string;
}

/* ------------------------------------------------------------------ */
/* Building, signing payload, validation                               */
/* ------------------------------------------------------------------ */

export interface BuildEvidencePackageParams {
  artifact: ArtifactDescriptor;
  createdAt: string;
  signatures?: EvidenceSignature[];
  storage?: StorageReceipt[];
  settlements?: SettlementReceipt[];
  inclusion?: MerkleInclusion;
  sessionId?: string;
}

/** Assemble a package (does not sign or anchor anything by itself). */
export const buildEvidencePackage = ({
  artifact,
  createdAt,
  signatures = [],
  storage = [],
  settlements = [],
  inclusion,
  sessionId,
}: BuildEvidencePackageParams): EvidencePackage => {
  const pkg: EvidencePackage = {
    p: EVIDENCE_PROTOCOL,
    v: EVIDENCE_PACKAGE_VERSION,
    artifact,
    signatures,
    storage,
    settlements,
    createdAt,
  };
  if (inclusion) pkg.inclusion = inclusion;
  if (sessionId) pkg.sessionId = sessionId;
  const errors = validateEvidencePackage(pkg);
  if (errors.length > 0) throw new Error(`Invalid evidence package: ${errors.join("; ")}`);
  return pkg;
};

/**
 * The canonical byte string a signer signs: the package identity plus the
 * artifact descriptor (and session id when present). Receipts are excluded
 * on purpose — they are produced *after* signing, and each is independently
 * verifiable on its own system.
 */
export const signingPayload = (
  pkg: Pick<EvidencePackage, "p" | "v" | "artifact" | "sessionId">,
): string =>
  canonicalStringify({
    p: pkg.p,
    v: pkg.v,
    artifact: pkg.artifact,
    ...(pkg.sessionId ? { sessionId: pkg.sessionId } : {}),
  });

/** SHA-256 (hex) of the signing payload — what `EvidenceSignature.payloadHash` must equal. */
export const signingPayloadHash = (
  pkg: Pick<EvidencePackage, "p" | "v" | "artifact" | "sessionId">,
): string => sha256HexUtf8(signingPayload(pkg));

const HEX_64 = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Structural validation. Returns a list of problems (empty = valid).
 * This checks the schema only — cryptographic verification (hashes,
 * signatures, inclusion proofs, receipts) is the verifier's job.
 */
export const validateEvidencePackage = (value: unknown): string[] => {
  const errors: string[] = [];
  const pkg = value as Partial<EvidencePackage> | null;
  if (!pkg || typeof pkg !== "object") return ["not an object"];
  if (pkg.p !== EVIDENCE_PROTOCOL) errors.push(`p must be "${EVIDENCE_PROTOCOL}"`);
  if (pkg.v !== EVIDENCE_PACKAGE_VERSION) errors.push(`v must be ${EVIDENCE_PACKAGE_VERSION}`);

  const artifact = pkg.artifact as Partial<ArtifactDescriptor> | undefined;
  if (!artifact || typeof artifact !== "object") {
    errors.push("artifact missing");
  } else {
    if (typeof artifact.cid !== "string" || !isValidCID(artifact.cid)) {
      errors.push("artifact.cid is not a valid CIDv1 base32 string");
    }
    if (typeof artifact.sha256 !== "string" || !HEX_64.test(artifact.sha256)) {
      errors.push("artifact.sha256 is not 64 lowercase hex chars");
    }
  }

  if (!Array.isArray(pkg.signatures)) {
    errors.push("signatures must be an array");
  } else {
    pkg.signatures.forEach((sig, i) => {
      if (!sig?.signer?.publicKey) errors.push(`signatures[${i}].signer.publicKey missing`);
      if (sig?.signer && sig.signer.scheme !== "eip191" && sig.signer.scheme !== "ed25519") {
        errors.push(`signatures[${i}].signer.scheme unknown`);
      }
      if (typeof sig?.payloadHash !== "string" || !HEX_64.test(sig.payloadHash)) {
        errors.push(`signatures[${i}].payloadHash is not 64 hex chars`);
      }
      if (typeof sig?.signature !== "string" || sig.signature.length === 0) {
        errors.push(`signatures[${i}].signature missing`);
      }
    });
  }

  if (!Array.isArray(pkg.storage)) errors.push("storage must be an array");
  if (!Array.isArray(pkg.settlements)) {
    errors.push("settlements must be an array");
  } else {
    pkg.settlements.forEach((receipt, i) => {
      if (typeof receipt?.chainId !== "string" || !receipt.chainId.includes(":")) {
        errors.push(`settlements[${i}].chainId missing`);
      }
      if (typeof receipt?.txHash !== "string" || receipt.txHash.length === 0) {
        errors.push(`settlements[${i}].txHash missing`);
      }
    });
  }

  if (pkg.inclusion) {
    const inc = pkg.inclusion;
    if (!HEX_64.test(inc.root ?? "")) errors.push("inclusion.root is not 64 hex chars");
    if (!Number.isInteger(inc.leafIndex) || inc.leafIndex < 0) {
      errors.push("inclusion.leafIndex must be a non-negative integer");
    }
    if (!Array.isArray(inc.proof) || inc.proof.some((p) => !HEX_64.test(p))) {
      errors.push("inclusion.proof must be an array of 64-hex-char hashes");
    }
  }

  if (typeof pkg.createdAt !== "string" || !ISO_DATE.test(pkg.createdAt)) {
    errors.push("createdAt must be an ISO 8601 timestamp");
  }
  return errors;
};

/** Parse a serialized package; null when it isn't one of ours. */
export const parseEvidencePackage = (raw: string): EvidencePackage | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return validateEvidencePackage(parsed).length === 0 ? (parsed as EvidencePackage) : null;
  } catch {
    return null;
  }
};
