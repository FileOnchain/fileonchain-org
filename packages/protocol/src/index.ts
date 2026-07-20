/**
 * @fileonchain/protocol — the FileOnChain Evidence Protocol reference
 * implementation core.
 *
 * Neutral and dependency-free: subject descriptors, namespaced claims,
 * artifact and envelope signatures with context-bound signing payloads,
 * tagged adapter receipts, deterministic canonical encoding, envelope
 * digests, Merkle inclusion, validation, and legacy migration. No AI
 * semantics (see @fileonchain/agent-profile), no chain registry, no
 * hosted-product code.
 *
 * Normative specification: docs/protocol/evidence-protocol.md.
 */

export {
  PROTOCOL_ID,
  PROTOCOL_VERSION,
  EVIDENCE_MEDIA_TYPE,
  type SubjectType,
  type DigestSet,
  type SubjectDescriptor,
  type Claims,
  type SignerKind,
  type SignatureScheme,
  type SignerIdentity,
  type ArtifactSignature,
  type EnvelopeSignature,
  type ReceiptType,
  type Receipt,
  type StorageReceipt,
  type SettlementReceipt,
  type InclusionReceipt,
  type ReceiptSet,
  type EnvelopeFinalization,
  type EvidenceEnvelope,
} from "./types";
export { canonicalStringify } from "./canonical";
export { sha256, sha256Hex, sha256HexUtf8, bytesToHex, hexToBytes } from "./sha256";
export { buildMerkleTree, verifyMerkleInclusion, type MerkleTree } from "./merkle";
export {
  artifactSigningPayload,
  artifactSigningPayloadDigest,
  envelopeSigningPayload,
  envelopeSigningPayloadDigest,
  computeEnvelopeDigest,
  finalizeEnvelope,
  addEnvelopeSignature,
  buildEnvelope,
  validateEnvelope,
  parseEnvelope,
  type ArtifactSigningContext,
  type BuildEnvelopeParams,
} from "./envelope";
export {
  registerAdapter,
  getAdapter,
  listAdapters,
  registerProfile,
  getProfile,
  listProfiles,
  merkleInclusionAdapter,
  MERKLE_INCLUSION_ADAPTER_ID,
  type AdapterCheckStatus,
  type AdapterCheckResult,
  type OnlineCheckOptions,
  type ReceiptAdapter,
  type ProfileDefinition,
} from "./adapters";
export {
  isLegacyEvidencePackage,
  migrateLegacyEvidence,
  legacyChainIdToSystem,
  LEGACY_STORAGE_ADAPTER_ID,
  LEGACY_SETTLEMENT_ADAPTER_ID,
  type LegacyEvidencePackage,
  type MigrateOptions,
} from "./migrate";
